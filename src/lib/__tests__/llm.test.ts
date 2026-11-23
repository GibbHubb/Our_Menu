// OM73 — the JSON-mode Gemini helper the four ex-Anthropic routes share. fetch is stubbed
// per test; the suite's no-network stub stays in place for everything else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_COMPLETIONS_URL, LLM_MODEL, LlmError, llmConfigured, llmJson, parseJsonLoose } from '@/lib/llm';
import { rejectWrong } from './control';

const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;

function stubFetch(status: number, body: unknown) {
    const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
}

const reply = (content: unknown) => ({ choices: [{ message: { content } }] });

beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = realKey;
});

describe('llmConfigured', () => {
    it('is true with a key and false with none or whitespace', () => {
        expect(llmConfigured()).toBe(true);
        process.env.GEMINI_API_KEY = '   ';
        expect(llmConfigured()).toBe(false);
        delete process.env.GEMINI_API_KEY;
        expect(llmConfigured()).toBe(false);
    });
});

describe('parseJsonLoose', () => {
    it('parses plain and fenced JSON', () => {
        expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
        expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(parseJsonLoose('```\n[1,2]\n```')).toEqual([1, 2]);
    });

    it('returns undefined for prose instead of throwing', () => {
        expect(parseJsonLoose('Sure! Here is your plan.')).toBeUndefined();
    });
});

describe('llmJson', () => {
    it('posts a JSON-mode chat completion to Gemini with the bearer key and model', async () => {
        const spy = stubFetch(200, reply('{"ok":true}'));
        const out = await llmJson({ prompt: 'hi', maxTokens: 77 });
        expect(out).toEqual({ json: { ok: true }, raw: '{"ok":true}' });

        const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(CHAT_COMPLETIONS_URL);
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
        expect(JSON.parse(String(init.body))).toEqual({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 77,
            response_format: { type: 'json_object' },
        });
    });

    it('sends an image as an inline base64 data URI before the text part', async () => {
        const spy = stubFetch(200, reply('{"items":[]}'));
        await llmJson({ prompt: 'read it', image: { base64: 'QUJD', mimeType: 'image/png' } });
        const body = JSON.parse(String((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
        expect(body.messages[0].content).toEqual([
            { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
            { type: 'text', text: 'read it' },
        ]);
    });

    it('throws LlmError on a non-2xx without echoing the body', async () => {
        stubFetch(429, { error: { message: 'secret quota detail' } });
        const err = await llmJson({ prompt: 'x' }).catch((e) => e);
        expect(err).toBeInstanceOf(LlmError);
        expect(err.status).toBe(429);
        expect(err.message).not.toContain('secret');
    });

    it('throws LlmError when the reply has no text', async () => {
        stubFetch(200, { choices: [] });
        await expect(llmJson({ prompt: 'x' })).rejects.toBeInstanceOf(LlmError);
    });

    it('CONTROL: fenced JSON is parsed, not handed back as undefined', () => {
        // Goes red under OM54_INVERT_CONTROLS=1, proving this file's assertions can fail.
        // The known-wrong answer is the regression where a ```json fence (which flash-lite
        // sometimes adds) makes every route answer "could not parse": undefined.
        rejectWrong(parseJsonLoose('```json\n{"items":[]}\n```'), undefined);
    });
});
