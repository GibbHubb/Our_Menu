/**
 * The one place that knows which LLM the app talks to.
 *
 * O6 (2026-10-21): this used to be a hardcoded LAN vLLM box (`192.168.2.182:8003`) that only
 * answered on Max's work VPN, so the deployed app could never reach it. Gemini's
 * OpenAI-compatible endpoint takes the same request and returns the same `choices[]` shape,
 * so callers only swap the URL, the key and the model name.
 *
 * `LLM_API_BASE` points it at any other OpenAI-compatible server (no `/chat/completions`
 * suffix); with no `GEMINI_API_KEY` no Authorization header is sent.
 */

export const LLM_API_BASE =
    process.env.LLM_API_BASE || "https://generativelanguage.googleapis.com/v1beta/openai";

/** Flash-lite: the high-quota free-tier model; the 2.5 models 404 for new keys. */
export const LLM_MODEL = process.env.LLM_MODEL || "gemini-3.5-flash-lite";

export const CHAT_COMPLETIONS_URL = `${LLM_API_BASE}/chat/completions`;

export function llmHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = process.env.GEMINI_API_KEY;
    if (key) headers.Authorization = `Bearer ${key}`;
    return headers;
}

/**
 * OM73 — the JSON-returning call the meal-plan, nutrition, receipt and substitution routes use
 * (they were on a paid SDK; personal work is Gemini free tier only).
 */

/** True when a Gemini key is set. Every AI route answers 503 without one rather than calling out. */
export function llmConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Abort a call that has not answered in this long; routes that wait on it set maxDuration = 60. */
export const LLM_TIMEOUT_MS = 45_000;

/**
 * Thrown for a non-2xx response, a timeout, a network failure or a reply with no text; the message
 * never echoes the body. `status` is the upstream HTTP status when there was one.
 */
export class LlmError extends Error {
    constructor(message: string, readonly status?: number, readonly timedOut = false) {
        super(message);
        this.name = "LlmError";
    }
}

/**
 * The JSON error and HTTP status a route returns when the LLM call failed. A Gemini 429 (free-tier
 * quota) is a 503 "busy" rather than a scary failure; everything else is a 502 naming the feature.
 */
export function llmFailure(err: unknown, feature: string): { status: number; error: string } {
    if (err instanceof LlmError && err.status === 429) {
        return { status: 503, error: "AI is busy, try again in a minute." };
    }
    if (err instanceof LlmError && err.timedOut) {
        return { status: 502, error: `The ${feature} took too long to answer. Try again.` };
    }
    return { status: 502, error: `Could not reach the ${feature}.` };
}

/** Strip ```json fences and parse. Returns undefined (not a throw) on anything that is not JSON. */
export function parseJsonLoose(raw: string): unknown {
    const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return undefined;
    }
}

export interface LlmJsonInput {
    prompt: string;
    /** Optional image, sent inline as a base64 data URI (Gemini vision via the OpenAI-compatible API). */
    image?: { base64: string; mimeType: string };
    maxTokens?: number;
}

export interface LlmJsonResult {
    /** Parsed JSON, or undefined when the reply was not JSON. */
    json: unknown;
    /** The model's text, for error reporting. */
    raw: string;
    /** "stop", or "length" when max_tokens cut the reply off (the JSON will then not parse). */
    finishReason?: string;
}

/**
 * One chat-completions call in JSON mode (`response_format: json_object`, which Gemini honours on
 * the OpenAI-compatible endpoint). JSON mode needs a top-level object, so prompts must ask for one.
 */
export async function llmJson({ prompt, image, maxTokens = 1024 }: LlmJsonInput): Promise<LlmJsonResult> {
    const content = image
        ? [
              { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
              { type: "text", text: prompt },
          ]
        : prompt;

    let res: Response;
    try {
        res = await fetch(CHAT_COMPLETIONS_URL, {
            method: "POST",
            headers: llmHeaders(),
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [{ role: "user", content }],
                max_tokens: maxTokens,
                response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });
    } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
            throw new LlmError(`LLM request timed out after ${LLM_TIMEOUT_MS} ms`, undefined, true);
        }
        throw new LlmError("LLM request failed: network error");
    }
    if (!res.ok) {
        throw new LlmError(`LLM request failed: HTTP ${res.status}`, res.status);
    }
    const data = (await res.json()) as {
        choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) {
        throw new LlmError("LLM returned no text");
    }
    return { json: parseJsonLoose(raw), raw, finishReason: data.choices?.[0]?.finish_reason };
}
