// OM75 — POST /api/recipes/[id]/extract drops the recipe's stale vector after it writes new
// ingredients or method, and only then. Supabase and the extractor are mocked: no network.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rejectWrong } from './control';

const log: string[] = [];
let stored: Record<string, unknown> = {};
let updateError: { message: string } | null = null;

function client() {
    return {
        from: (table: string) => {
            if (table === 'recipe_embeddings') {
                return {
                    delete: () => ({
                        eq: (_c: string, id: string) => ({
                            select: async () => {
                                log.push(`drop:${id}`);
                                return { data: [{ recipe_id: id }], error: null };
                            },
                        }),
                    }),
                };
            }
            return {
                select: () => ({ eq: () => ({ single: async () => ({ data: stored, error: null }) }) }),
                update: (values: Record<string, unknown>) => ({
                    eq: () => ({
                        select: () => ({
                            single: async () => {
                                log.push(updateError ? 'update-failed' : 'updated');
                                return updateError
                                    ? { data: null, error: updateError }
                                    : { data: { ...stored, ...values }, error: null };
                            },
                        }),
                    }),
                }),
            };
        },
    };
}

vi.mock('@/lib/supabaseServer', () => ({ createRequestClient: () => client() }));
vi.mock('@/lib/recipeExtractor', () => ({
    extractJsonLdOnly: async () => ({
        ingredients: ['pasta', 'basil'],
        instructions: ['Boil.'],
        servings: null,
        warnings: [],
        sourcePath: 'jsonld',
    }),
    instructionsToText: (s: string[]) => s.join('\n'),
    ingredientsToShoppingList: (s: string[]) => s.join('\n'),
}));

import { POST } from '@/app/api/recipes/[id]/extract/route';

const call = (body?: unknown) =>
    POST(
        new Request('http://localhost/api/recipes/r1/extract', {
            method: 'POST',
            body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: 'r1' }) },
    );

beforeEach(() => {
    log.length = 0;
    updateError = null;
    stored = { id: 'r1', title: 'Pasta', link: 'https://x', ingredients: '', instructions: '', shopping_list: '', servings: 2 };
});

describe('OM75 extract route', () => {
    it('filling blank ingredients/method updates the recipe, then drops its vector', async () => {
        const res = await call();
        expect(res.status).toBe(200);
        expect(log).toEqual(['updated', 'drop:r1']);
    });

    it('a failed update never drops the vector', async () => {
        updateError = { message: 'rls' };
        const res = await call();
        expect(res.status).toBe(500);
        expect(log).toEqual(['update-failed']);
    });

    it('nothing written (recipe already has content) leaves the vector alone', async () => {
        stored = { ...stored, ingredients: 'x', instructions: 'y', shopping_list: 'z' };
        const res = await call();
        expect(res.status).toBe(200);
        expect(log).toEqual([]);
    });

    it('CONTROL: a successful ingredients write is not left with its old vector', async () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the pre-OM75 behaviour:
        // the recipe updated and no drop.
        await call();
        rejectWrong(log, ['updated']);
    });
});
