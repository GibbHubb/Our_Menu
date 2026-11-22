// OM68 — the Gemini embeddings helper. fetch is stubbed per test (the suite's
// no-network stub stays in place for everything else).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    EMBEDDING_DIMENSIONS,
    EmbeddingsNotConfiguredError,
    embedText,
    embeddingsConfigured,
    recipeEmbeddingText,
} from '@/lib/embeddings';
import { rejectWrong } from './control';

const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;

function stubFetch(status: number, body: unknown) {
    const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
}

beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = realKey;
});

describe('embedText', () => {
    it('fits the vector(1536) column', () => {
        expect(EMBEDDING_DIMENSIONS).toBe(1536);
    });

    it('calls Gemini embedContent with the key header, task type and 1536 dims', async () => {
        const spy = stubFetch(200, { embedding: { values: Array(1536).fill(0.1) } });
        const out = await embedText('lamb curry', 'RETRIEVAL_QUERY');
        expect(out).toHaveLength(1536);

        const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
        );
        expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
            content: { parts: [{ text: 'lamb curry' }] },
            taskType: 'RETRIEVAL_QUERY',
            outputDimensionality: 1536,
        });
    });

    it('throws EmbeddingsNotConfiguredError with no key, and makes no call', async () => {
        delete process.env.GEMINI_API_KEY;
        const spy = stubFetch(200, {});
        expect(embeddingsConfigured()).toBe(false);
        await expect(embedText('x', 'RETRIEVAL_QUERY')).rejects.toBeInstanceOf(EmbeddingsNotConfiguredError);
        expect(spy).not.toHaveBeenCalled();
    });

    it('throws on a non-2xx response without echoing the body', async () => {
        stubFetch(429, { error: { message: 'quota' } });
        await expect(embedText('x', 'RETRIEVAL_DOCUMENT')).rejects.toThrow(/HTTP 429/);
    });

    it('rejects a vector of the wrong length rather than writing it to the column', async () => {
        stubFetch(200, { embedding: { values: Array(768).fill(0.1) } });
        await expect(embedText('x', 'RETRIEVAL_DOCUMENT')).rejects.toThrow(/768 values, expected 1536/);
    });

    it('CONTROL: with no key, embeddings never report as configured', () => {
        // Goes red under OM54_INVERT_CONTROLS=1, proving this file's assertions
        // can fail. The known-wrong answer is the bug that would let both routes
        // call Gemini keyless instead of answering 503: configured === true.
        delete process.env.GEMINI_API_KEY;
        rejectWrong(embeddingsConfigured(), true);
    });
});

describe('recipeEmbeddingText', () => {
    it('joins title, ingredients and method, skipping blanks', () => {
        expect(recipeEmbeddingText({ title: 'Dal', ingredients: ['lentils', 'cumin'], instructions: null }))
            .toBe('Dal\nlentils, cumin');
    });

    it('caps at 8000 chars', () => {
        expect(recipeEmbeddingText({ title: 'a'.repeat(9000) })).toHaveLength(8000);
    });
});
