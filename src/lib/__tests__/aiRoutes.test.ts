// OM73 — the four AI routes moved from the Anthropic SDK to Gemini (src/lib/llm.ts). These pin
// each route's response shape (the UI reads it unchanged), the 503 with no GEMINI_API_KEY, and
// the ai-status flag. fetch is stubbed per test and Supabase is mocked: no network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rejectWrong } from './control';

// ── Supabase fake ────────────────────────────────────────────────────────────
// Each `from(table)` returns a chain whose terminal await resolves to db[table].
const db: Record<string, { data: unknown; error: unknown }> = {};
const updates: { table: string; values: unknown }[] = [];
const upserts: { table: string; values: unknown }[] = [];
let upsertError: unknown = null;

function chain(table: string) {
    const result = () => db[table] ?? { data: null, error: null };
    const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        gte: () => c,
        single: () => Promise.resolve(result()),
        update: (values: unknown) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
        },
        upsert: (values: unknown) => {
            upserts.push({ table, values });
            return Promise.resolve({ error: upsertError });
        },
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
    };
    return c;
}

// `signedIn` flips per test: the AI routes refuse anonymous callers (OM55, OM73).
let signedIn = true;
vi.mock('@/lib/supabaseServer', () => ({
    createRequestClient: () => ({ from: (t: string) => chain(t) }),
    getRequestUser: async () => (signedIn ? { id: 'user-1' } : null),
}));

import { POST as mealPlan } from '@/app/api/meal-plan/generate/route';
import { POST as nutrition } from '@/app/api/nutrition/[id]/route';
import { POST as receipts } from '@/app/api/receipts/scan/route';
import { POST as substitutions } from '@/app/api/substitutions/route';
import { GET as aiStatus } from '@/app/api/ai-status/route';
import { POST as search } from '@/app/api/recipes/search/route';
import { POST as embed } from '@/app/api/recipes/embed/route';
import { POST as chat } from '@/app/api/chat/route';

// ── fetch stub ───────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;
const realDisable = process.env.AI_DISABLE;

function stubLlm(content: string, status = 200) {
    const body = status === 200 ? { choices: [{ message: { content } }] } : { error: 'x' };
    const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
}

function sentBody(spy: ReturnType<typeof stubLlm>) {
    return JSON.parse(String((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
}

const jsonReq = (url: string, body: unknown) =>
    new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    signedIn = true;
    delete process.env.AI_DISABLE;
    for (const k of Object.keys(db)) delete db[k];
    updates.length = 0;
    upserts.length = 0;
    upsertError = null;
});

afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = realKey;
    if (realDisable === undefined) delete process.env.AI_DISABLE;
    else process.env.AI_DISABLE = realDisable;
});

// ── meal-plan/generate ───────────────────────────────────────────────────────
describe('POST /api/meal-plan/generate', () => {
    it('returns { plan: { days } } with recipe_id matched by title, case-insensitively', async () => {
        db.recipes = { data: [{ id: 'r1', title: 'Lamb Curry', category: ['Dinner'], rating: 5, seasons: [] }], error: null };
        db.cook_log = { data: [], error: null };
        const spy = stubLlm(JSON.stringify({
            days: [
                { day: 1, meal: 'Lamb curry', recipe_title: 'lamb curry', recipe_id: null, reason: 'rated 5' },
                { day: 2, meal: 'Toast', recipe_title: null, recipe_id: null, reason: 'new' },
            ],
        }));

        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { pantry: '', dietary: '', days: 2 }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            plan: {
                days: [
                    { day: 1, meal: 'Lamb curry', recipe_title: 'lamb curry', recipe_id: 'r1', reason: 'rated 5' },
                    { day: 2, meal: 'Toast', recipe_title: null, recipe_id: null, reason: 'new' },
                ],
            },
        });
        const body = sentBody(spy);
        expect(body.response_format).toEqual({ type: 'json_object' });
        expect(body.messages[0].content).toContain('- Lamb Curry (Dinner) [rated 5/5 - preferred]');
    });

    it('OM74: replaces a meal-type `meal` ("Lunch") with the dish, and the prompt forbids it', async () => {
        db.recipes = { data: [{ id: 'r1', title: 'Lamb Curry', category: [], rating: null, seasons: [] }], error: null };
        db.cook_log = { data: [], error: null };
        const spy = stubLlm(JSON.stringify({
            days: [
                { day: 1, meal: 'Lunch', recipe_title: 'Lamb Curry', recipe_id: null, reason: 'x' },
                { day: 2, meal: 'Dinner', recipe_title: null, recipe_id: null, reason: 'y' },
            ],
        }));
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 2 }));
        const { plan } = await res.json();
        expect(plan.days.map((d: { meal: string }) => d.meal)).toEqual(['Lamb Curry', "Chef's choice"]);
        expect(plan.days[0].recipe_id).toBe('r1');
        expect(sentBody(spy).messages[0].content).toContain('never the meal type');
    });

    it('answers 500 "Failed to parse meal plan" when the reply has no days array', async () => {
        db.recipes = { data: [], error: null };
        stubLlm('{"plan":"nope"}');
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('Failed to parse meal plan');
    });

    it('answers 502 when Gemini errors', async () => {
        db.recipes = { data: [], error: null };
        stubLlm('', 500);
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }));
        expect(res.status).toBe(502);
    });

    it('answers 503 with no GEMINI_API_KEY and makes no call', async () => {
        delete process.env.GEMINI_API_KEY;
        const spy = stubLlm('{}');
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }));
        expect(res.status).toBe(503);
        expect(spy).not.toHaveBeenCalled();
    });

    it('answers 401 to an anonymous caller and makes no call', async () => {
        signedIn = false;
        const spy = stubLlm('{}');
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }));
        expect(res.status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
    });

    it('answers 400 to a malformed body and makes no call', async () => {
        const spy = stubLlm('{}');
        const res = await mealPlan(new NextRequest('http://localhost/api/meal-plan/generate', { method: 'POST', body: '{nope' }));
        expect(res.status).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });

    it.each([
        [30, 14], [14, 14], [0, 1], [-5, 1], [3, 3], ['junk', 7], [undefined, 7],
    ])('clamps days=%s to a %i-day plan', async (asked, used) => {
        db.recipes = { data: [], error: null };
        const spy = stubLlm('{"days":[]}');
        await mealPlan(jsonReq('/api/meal-plan/generate', { days: asked }));
        const prompt = sentBody(spy).messages[0].content as string;
        expect(prompt).toContain(`create a ${used}-day meal plan`);
        expect(prompt).toContain(`- Plan length: ${used} days`);
    });

    it('maps a Gemini 429 to a 503 "AI is busy"', async () => {
        db.recipes = { data: [], error: null };
        stubLlm('', 429);
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }));
        expect(res.status).toBe(503);
        expect((await res.json()).error).toBe('AI is busy, try again in a minute.');
    });
});

// ── nutrition/[id] ───────────────────────────────────────────────────────────
describe('POST /api/nutrition/[id]', () => {
    const ctx = { params: Promise.resolve({ id: 'r1' }) };
    const recipe = {
        id: 'r1', title: 'Curry', ingredients: '500g lamb\n1 onion', ingredients_hash: null,
        kcal_per_serving: null, nutrition_generated_at: null,
    };

    it('returns { cached:false, kcal, protein, carbs, fat, ingredients_hash } and persists them', async () => {
        db.recipes = { data: recipe, error: null };
        stubLlm('{"kcal_per_serving": 612.4, "protein_g": 40, "carbs_g": 12, "fat_g": 44}');

        const res = await nutrition(new NextRequest('http://localhost/api/nutrition/r1', { method: 'POST' }), ctx);
        expect(res.status).toBe(200);
        const out = await res.json();
        expect(Object.keys(out).sort()).toEqual(
            ['cached', 'carbs_g', 'fat_g', 'ingredients_hash', 'kcal_per_serving', 'protein_g'],
        );
        expect(out).toMatchObject({ cached: false, kcal_per_serving: 612, protein_g: 40, carbs_g: 12, fat_g: 44 });
        expect(out.ingredients_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(updates[0]).toMatchObject({ table: 'recipes', values: { kcal_per_serving: 612 } });
    });

    it('OM74: answers 401 to an anonymous caller before any DB or LLM work', async () => {
        signedIn = false;
        db.recipes = { data: recipe, error: null };
        const spy = stubLlm('{}');
        const res = await nutrition(new NextRequest('http://localhost/api/nutrition/r1', { method: 'POST' }), ctx);
        expect(res.status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
        expect(updates).toHaveLength(0);
    });

    it('answers 502 when the estimator returns the wrong shape', async () => {
        db.recipes = { data: recipe, error: null };
        stubLlm('{"calories": 600}');
        const res = await nutrition(new NextRequest('http://localhost/api/nutrition/r1', { method: 'POST' }), ctx);
        expect(res.status).toBe(502);
    });

    it('answers 503 with no GEMINI_API_KEY and makes no call', async () => {
        delete process.env.GEMINI_API_KEY;
        const spy = stubLlm('{}');
        const res = await nutrition(new NextRequest('http://localhost/api/nutrition/r1', { method: 'POST' }), ctx);
        expect(res.status).toBe(503);
        expect(spy).not.toHaveBeenCalled();
    });
});

// ── receipts/scan ────────────────────────────────────────────────────────────
describe('POST /api/receipts/scan', () => {
    function receiptReq(type = 'image/png', bytes: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3])) {
        const fd = new FormData();
        fd.append('image', new File([bytes], 'r.png', { type }));
        return new NextRequest('http://localhost/api/receipts/scan', { method: 'POST', body: fd });
    }

    it('sends the image inline and returns { items }', async () => {
        const spy = stubLlm('{"items":[{"name":"Milk","quantity":"2"}]}');
        const res = await receipts(receiptReq());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ items: [{ name: 'Milk', quantity: '2' }] });

        const content = sentBody(spy).messages[0].content;
        expect(content[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } });
        expect(content[1].type).toBe('text');
    });

    it('still accepts a bare array if the model ignores the wrapper', async () => {
        stubLlm('[{"name":"Eggs","quantity":"12"}]');
        expect(await (await receipts(receiptReq())).json()).toEqual({ items: [{ name: 'Eggs', quantity: '12' }] });
    });

    it('answers 422 "Could not parse items" on prose', async () => {
        stubLlm('I cannot read this.');
        const res = await receipts(receiptReq());
        expect(res.status).toBe(422);
        expect((await res.json()).error).toBe('Could not parse items');
    });

    it('answers 503 with no GEMINI_API_KEY and makes no call', async () => {
        delete process.env.GEMINI_API_KEY;
        const spy = stubLlm('{}');
        const res = await receipts(receiptReq());
        expect(res.status).toBe(503);
        expect(spy).not.toHaveBeenCalled();
    });

    it('answers 401 to an anonymous caller and makes no call', async () => {
        signedIn = false;
        const spy = stubLlm('{}');
        expect((await receipts(receiptReq())).status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
    });

    it.each(['image/webp', 'image/jpeg', 'IMAGE/JPEG'])('accepts %s', async (type) => {
        stubLlm('{"items":[]}');
        expect((await receipts(receiptReq(type))).status).toBe(200);
    });

    it.each(['image/heic', 'application/pdf', ''])('answers 415 to type "%s" and makes no call', async (type) => {
        const spy = stubLlm('{}');
        const res = await receipts(receiptReq(type));
        expect(res.status).toBe(415);
        expect((await res.json()).error).toBe('Use a JPEG, PNG or WebP photo.');
        expect(spy).not.toHaveBeenCalled();
    });

    it('answers a JSON 413 above 4 MB and makes no call', async () => {
        const spy = stubLlm('{}');
        const res = await receipts(receiptReq('image/jpeg', new Uint8Array(4 * 1024 * 1024 + 1)));
        expect(res.status).toBe(413);
        expect((await res.json()).error).toMatch(/too large/);
        expect(spy).not.toHaveBeenCalled();
    });

    it('maps a Gemini 429 to a 503 "AI is busy"', async () => {
        stubLlm('', 429);
        const res = await receipts(receiptReq());
        expect(res.status).toBe(503);
        expect((await res.json()).error).toBe('AI is busy, try again in a minute.');
    });
});

// ── substitutions ────────────────────────────────────────────────────────────
describe('POST /api/substitutions', () => {
    it('returns { substitutions: [{ name, note }] }', async () => {
        stubLlm('{"substitutions":[{"name":"Lime","note":"Sharper; use a little less."}]}');
        const res = await substitutions(jsonReq('/api/substitutions', { ingredient: 'lemon', recipeName: 'Fish' }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ substitutions: [{ name: 'Lime', note: 'Sharper; use a little less.' }] });
    });

    it('answers 500 "Unexpected response format" without a substitutions array', async () => {
        stubLlm('{"subs":[]}');
        const res = await substitutions(jsonReq('/api/substitutions', { ingredient: 'lemon' }));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('Unexpected response format');
    });

    it('answers 503 with no GEMINI_API_KEY and makes no call', async () => {
        delete process.env.GEMINI_API_KEY;
        const spy = stubLlm('{}');
        const res = await substitutions(jsonReq('/api/substitutions', { ingredient: 'lemon' }));
        expect(res.status).toBe(503);
        expect(spy).not.toHaveBeenCalled();
    });

    it('answers 401 to an anonymous caller and makes no call', async () => {
        signedIn = false;
        const spy = stubLlm('{}');
        expect((await substitutions(jsonReq('/api/substitutions', { ingredient: 'lemon' }))).status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
    });

    it('maps a Gemini 429 to a 503 "AI is busy"', async () => {
        stubLlm('', 429);
        const res = await substitutions(jsonReq('/api/substitutions', { ingredient: 'lemon' }));
        expect(res.status).toBe(503);
        expect((await res.json()).error).toBe('AI is busy, try again in a minute.');
    });
});

// ── recipes/search ───────────────────────────────────────────────────────────
describe('POST /api/recipes/search', () => {
    it('answers 401 to an anonymous caller and makes no embedding call', async () => {
        signedIn = false;
        const spy = stubLlm('{}');
        expect((await search(jsonReq('/api/recipes/search', { query: 'curry' }))).status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
    });

    it('answers 400 to a malformed body', async () => {
        const res = await search(new NextRequest('http://localhost/api/recipes/search', { method: 'POST', body: '{nope' }));
        expect(res.status).toBe(400);
    });
});

// ── ai-status ────────────────────────────────────────────────────────────────
describe('GET /api/ai-status', () => {
    const all = (v: boolean) => ({ chat: v, search: v, mealPlan: v, nutrition: v, receipts: v, substitutions: v });

    it('OM72: every feature on with GEMINI_API_KEY, all off without it', async () => {
        expect(await (await aiStatus()).json()).toEqual({ enabled: true, features: all(true) });
        delete process.env.GEMINI_API_KEY;
        expect(await (await aiStatus()).json()).toEqual({ enabled: false, features: all(false) });
    });

    it('OM72: AI_DISABLE=search,nutrition turns just those off', async () => {
        process.env.AI_DISABLE = 'search,nutrition';
        expect(await (await aiStatus()).json()).toEqual({
            enabled: true, features: { ...all(true), search: false, nutrition: false },
        });
    });

    it('CONTROL: with a Gemini key the AI features are not hidden', async () => {
        // Goes red under OM54_INVERT_CONTROLS=1, proving this file's assertions can fail.
        // The known-wrong answer is the pre-OM73 bug: the flag still keyed on the old paid
        // SDK's key, so with only GEMINI_API_KEY set every AI feature stayed hidden.
        rejectWrong((await (await aiStatus()).json()).enabled, false);
    });
});

// ── OM72: each route follows its own switch ─────────────────────────────────
describe('per-feature switch (AI_DISABLE)', () => {
    const ctx = { params: Promise.resolve({ id: 'r1' }) };
    const cases: [string, () => Promise<Response>][] = [
        ['chat', () => chat(jsonReq('/api/chat', { messages: [{ role: 'user', content: 'hi' }] }))],
        ['search', () => search(jsonReq('/api/recipes/search', { query: 'curry' }))],
        ['search', () => embed(jsonReq('/api/recipes/embed', {}))],
        ['mealPlan', () => mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }))],
        ['nutrition', () => nutrition(new NextRequest('http://localhost/api/nutrition/r1', { method: 'POST' }), ctx)],
        ['receipts', () => {
            const fd = new FormData();
            fd.append('image', new File([new Uint8Array([1])], 'r.png', { type: 'image/png' }));
            return receipts(new NextRequest('http://localhost/api/receipts/scan', { method: 'POST', body: fd }));
        }],
        ['substitutions', () => substitutions(jsonReq('/api/substitutions', { ingredient: 'lemon' }))],
    ];

    it.each(cases)('%s off: answers 503 "switched off" and makes no call', async (feature, call) => {
        process.env.AI_DISABLE = feature;
        db.recipes = { data: [], error: null };
        const spy = stubLlm('{}');
        const res = await call();
        expect(res.status).toBe(503);
        expect((await res.json()).error).toMatch(/switched off on this deployment/);
        expect(spy).not.toHaveBeenCalled();
    });

    it('chat answers 503 with no GEMINI_API_KEY and makes no call (it never checked)', async () => {
        delete process.env.GEMINI_API_KEY;
        const spy = stubLlm('{}');
        const res = await chat(jsonReq('/api/chat', { messages: [] }));
        expect(res.status).toBe(503);
        expect(spy).not.toHaveBeenCalled();
    });

    it('substitutions answers 400 to a malformed body', async () => {
        const res = await substitutions(new NextRequest('http://localhost/api/substitutions', { method: 'POST', body: '{nope' }));
        expect(res.status).toBe(400);
    });
});

// ── OM72: recipes/embed ──────────────────────────────────────────────────────
describe('POST /api/recipes/embed', () => {
    const recipes = (n: number) =>
        Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: `Recipe ${i}`, ingredients: 'x', instructions: 'y' }));

    /** Gemini embedContent stub; `statusFor(callIndex)` picks the HTTP status per call. */
    function stubEmbed(statusFor: (i: number) => number = () => 200) {
        let i = 0;
        const spy = vi.fn(async () => {
            const status = statusFor(i++);
            const body = status === 200 ? { embedding: { values: Array(1536).fill(0.1) } } : { error: 'x' };
            return new Response(JSON.stringify(body), { status });
        });
        globalThis.fetch = spy as unknown as typeof fetch;
        return spy;
    }

    const post = (qs = '') => embed(new NextRequest(`http://localhost/api/recipes/embed${qs}`, { method: 'POST' }));
    const old = '2026-11-01T00:00:00Z';

    it('embeds only recipes with no vector and reports the counts', async () => {
        db.recipes = { data: recipes(5), error: null };
        db.recipe_embeddings = { data: [{ recipe_id: 'r0', embedded_at: old }, { recipe_id: 'r3', embedded_at: old }], error: null };
        const spy = stubEmbed();
        const res = await post();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ embedded: 3, skipped: 2, failed: 0, remaining: 0 });
        expect(spy).toHaveBeenCalledTimes(3);
        expect(upserts.map((u) => (u.values as { recipe_id: string }).recipe_id).sort()).toEqual(['r1', 'r2', 'r4']);
    });

    it('caps each call at 20 and says how many remain', async () => {
        db.recipes = { data: recipes(45), error: null };
        db.recipe_embeddings = { data: [], error: null };
        const spy = stubEmbed();
        expect(await (await post()).json()).toEqual({ embedded: 20, skipped: 0, failed: 0, remaining: 25 });
        expect(spy).toHaveBeenCalledTimes(20);
    });

    it('counts a failed embedding or upsert as failed and still remaining', async () => {
        db.recipes = { data: recipes(3), error: null };
        db.recipe_embeddings = { data: [], error: null };
        stubEmbed((i) => (i === 1 ? 500 : 200));
        expect(await (await post()).json()).toEqual({ embedded: 2, skipped: 0, failed: 1, remaining: 1 });

        upsertError = { message: 'rls' };
        stubEmbed();
        expect(await (await post()).json()).toEqual({ embedded: 0, skipped: 0, failed: 3, remaining: 3 });
    });

    it('stops starting new batches after a Gemini 429', async () => {
        db.recipes = { data: recipes(12), error: null };
        db.recipe_embeddings = { data: [], error: null };
        const spy = stubEmbed((i) => (i === 0 ? 429 : 200));
        const out = await (await post()).json();
        expect(spy).toHaveBeenCalledTimes(4); // the first group of 4 ran; no second group
        expect(out).toEqual({ embedded: 3, skipped: 0, failed: 1, remaining: 9, busy: true });
    });

    it('?force=1 re-embeds existing vectors and returns `since` to resume with', async () => {
        db.recipes = { data: recipes(2), error: null };
        db.recipe_embeddings = { data: [{ recipe_id: 'r0', embedded_at: old }], error: null };
        stubEmbed();
        const out = await (await post('?force=1')).json();
        expect(out).toMatchObject({ embedded: 2, skipped: 0, failed: 0, remaining: 0 });
        expect(Date.parse(out.since)).not.toBeNaN();

        // Resuming with since: a vector written after it counts as done.
        db.recipe_embeddings = {
            data: [{ recipe_id: 'r0', embedded_at: '2026-11-23T10:00:00Z' }, { recipe_id: 'r1', embedded_at: old }],
            error: null,
        };
        const spy = stubEmbed();
        expect(await (await post('?force=1&since=2026-11-23T09:00:00Z')).json())
            .toEqual({ embedded: 1, skipped: 1, failed: 0, remaining: 0, since: '2026-11-23T09:00:00.000Z' });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('answers 401 to an anonymous caller and makes no call', async () => {
        signedIn = false;
        const spy = stubEmbed();
        expect((await post()).status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
    });
});
