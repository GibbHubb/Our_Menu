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
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
    };
    return c;
}

vi.mock('@/lib/supabaseServer', () => ({
    createRequestClient: () => ({ from: (t: string) => chain(t) }),
    getRequestUser: async () => ({ id: 'user-1' }),
}));

import { POST as mealPlan } from '@/app/api/meal-plan/generate/route';
import { POST as nutrition } from '@/app/api/nutrition/[id]/route';
import { POST as receipts } from '@/app/api/receipts/scan/route';
import { POST as substitutions } from '@/app/api/substitutions/route';
import { GET as aiStatus } from '@/app/api/ai-status/route';

// ── fetch stub ───────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;

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
    for (const k of Object.keys(db)) delete db[k];
    updates.length = 0;
});

afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = realKey;
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

    it('answers 500 "Failed to parse meal plan" when the reply has no days array', async () => {
        db.recipes = { data: [], error: null };
        stubLlm('{"plan":"nope"}');
        const res = await mealPlan(jsonReq('/api/meal-plan/generate', { days: 3 }));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('Failed to parse meal plan');
    });

    it('answers 502 when Gemini errors', async () => {
        db.recipes = { data: [], error: null };
        stubLlm('', 429);
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
    function receiptReq() {
        const fd = new FormData();
        fd.append('image', new File([new Uint8Array([1, 2, 3])], 'r.png', { type: 'image/png' }));
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
});

// ── ai-status ────────────────────────────────────────────────────────────────
describe('GET /api/ai-status', () => {
    it('is enabled with GEMINI_API_KEY and disabled without it', async () => {
        expect(await (await aiStatus()).json()).toEqual({ enabled: true });
        delete process.env.GEMINI_API_KEY;
        expect(await (await aiStatus()).json()).toEqual({ enabled: false });
    });

    it('CONTROL: with a Gemini key the AI features are not hidden', async () => {
        // Goes red under OM54_INVERT_CONTROLS=1, proving this file's assertions can fail.
        // The known-wrong answer is the pre-OM73 bug: the flag still keyed on the old paid
        // SDK's key, so with only GEMINI_API_KEY set every AI feature stayed hidden.
        rejectWrong(await (await aiStatus()).json(), { enabled: false });
    });
});
