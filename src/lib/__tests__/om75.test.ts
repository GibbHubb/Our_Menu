// OM75 — one chat button, no stale recipe vectors after an edit, no EXIF-rotated JPEG pass-through.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { rejectWrong } from './control';
import { canPassThrough, PASS_THROUGH_BYTES } from '@/lib/imageDownscale';
import { embeddingTextChanged, dropStaleEmbedding, type EmbeddingDeleteClient } from '@/lib/staleEmbedding';

const src = (p: string) => readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

/** A fake client recording the one delete call; `result` is what the delete resolves (or throws). */
function fakeClient(result: { error: { message: string } | null } | Error) {
    const calls: { table: string; column: string; value: string }[] = [];
    const client: EmbeddingDeleteClient = {
        from: (table) => ({
            delete: () => ({
                eq: (column, value) => {
                    calls.push({ table, column, value });
                    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
                },
            }),
        }),
    };
    return { client, calls };
}

describe('OM75 (1) one chat', () => {
    it('the layout mounts ChatAgent, AIChat is gone, and MenuContainer no longer renders its own', () => {
        expect(src('app/layout.tsx')).toMatch(/import ChatAgent from "@\/components\/ChatAgent"/);
        expect(src('app/layout.tsx')).toMatch(/<ChatAgent \/>/);
        expect(existsSync(path.resolve(__dirname, '../../components/AIChat.tsx'))).toBe(false);
        expect(src('components/MenuContainer.tsx')).not.toMatch(/<ChatAgent|import ChatAgent/);
    });

    it('the kept chat still obeys the per-feature `chat` flag (which hides it signed out)', () => {
        const chat = src('components/ChatAgent.tsx');
        expect(chat).toMatch(/useAiFeature\("chat"\)/);
        expect(chat).toMatch(/if \(chatOn !== true\) return null;/);
    });
});

describe('OM75 (2) stale embeddings', () => {
    const r = { title: 'Pasta', ingredients: 'pasta\ntomato', instructions: 'Boil.' };

    it('a title, ingredient or method change marks the vector stale', () => {
        expect(embeddingTextChanged(r, { ...r, title: 'Penne' })).toBe(true);
        expect(embeddingTextChanged(r, { ...r, ingredients: 'pasta\nbasil' })).toBe(true);
        expect(embeddingTextChanged(r, { ...r, instructions: 'Boil well.' })).toBe(true);
        expect(embeddingTextChanged(undefined, r)).toBe(true);
    });

    it('a save that leaves that text alone (notes, rating, photo) keeps the vector', () => {
        expect(embeddingTextChanged(r, { ...r })).toBe(false);
        expect(embeddingTextChanged({ ...r, notes: 'old' } as typeof r, { ...r, notes: 'new' } as typeof r)).toBe(false);
    });

    it('drops exactly that recipe\'s row from recipe_embeddings', async () => {
        const { client, calls } = fakeClient({ error: null });
        expect(await dropStaleEmbedding(client, 'abc')).toBe(true);
        expect(calls).toEqual([{ table: 'recipe_embeddings', column: 'recipe_id', value: 'abc' }]);
    });

    it('a failed delete never fails the save: it reports false and does not throw', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await dropStaleEmbedding(fakeClient({ error: { message: 'rls' } }).client, 'abc')).toBe(false);
        expect(await dropStaleEmbedding(fakeClient(new Error('offline')).client, 'abc')).toBe(false);
        spy.mockRestore();
    });

    it('every save path that can change the embedded text drops the vector', () => {
        expect(src('components/MenuContainer.tsx')).toMatch(/embeddingTextChanged\(before, updated\)\) void dropStaleEmbedding\(supabase, updated\.id\)/);
        expect(src('app/recipe/[id]/page.tsx')).toMatch(/embeddingTextChanged\(before, updated\)\) await dropStaleEmbedding\(supabase, updated\.id\)/);
        expect(src('app/api/recipes/[id]/extract/route.ts')).toMatch(/await dropStaleEmbedding\(supabase, id\)/);
    });
});

describe('OM75 (3) JPEG orientation', () => {
    const small = { width: 1200, height: 900 };

    it('a small in-bounds JPEG is re-encoded (upright, tag dropped), never passed through', () => {
        expect(canPassThrough('image/jpeg', 200_000, small, small)).toBe(false);
        expect(canPassThrough('IMAGE/JPEG', 1, small, small)).toBe(false);
    });

    it('a small in-bounds PNG or WebP still passes through untouched', () => {
        expect(canPassThrough('image/png', 200_000, small, small)).toBe(true);
        expect(canPassThrough('image/webp', PASS_THROUGH_BYTES, small, small)).toBe(true);
    });

    it('a big or oversized PNG is re-encoded', () => {
        expect(canPassThrough('image/png', PASS_THROUGH_BYTES + 1, small, small)).toBe(false);
        expect(canPassThrough('image/png', 1000, { width: 4000, height: 3000 }, { width: 1600, height: 1200 })).toBe(false);
    });

    it('CONTROL: a small JPEG is not passed through with its EXIF orientation tag', () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the OM74 behaviour this
        // ticket removes: `true`, the JPEG sent on untouched with its Orientation tag.
        rejectWrong(canPassThrough('image/jpeg', 200_000, small, small), true);
    });
});
