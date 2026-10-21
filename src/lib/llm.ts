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
