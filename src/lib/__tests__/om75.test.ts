// OM75 — no stale recipe vectors after an edit, no EXIF-rotated JPEG pass-through.
// (The one-chat behaviour is in om75.chat.test.ts; the extract route in om75.extract.test.ts.)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rejectWrong } from './control';
import { canPassThrough, PASS_THROUGH_BYTES } from '@/lib/imageDownscale';
import {
    embeddingTextChanged,
    dropStaleEmbedding,
    saveThenDropStale,
    type DropResult,
    type EmbeddingDeleteClient,
} from '@/lib/staleEmbedding';

afterEach(() => vi.restoreAllMocks());

type DeleteReply = { data: { recipe_id: string }[] | null; error: { message: string } | null };

/** A fake client recording the one delete call; `reply` is what the delete resolves (or throws). */
function fakeClient(reply: DeleteReply | Error) {
    const calls: { table: string; column: string; value: string; returning: string }[] = [];
    const client: EmbeddingDeleteClient = {
        from: (table) => ({
            delete: () => ({
                eq: (column, value) => ({
                    select: (returning) => {
                        calls.push({ table, column, value, returning });
                        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
                    },
                }),
            }),
        }),
    };
    return { client, calls };
}

const stored = { id: 'r1', title: 'Pasta', ingredients: 'pasta\ntomato', instructions: 'Boil.', notes: 'old' };

/** A save that fails `failures` times, then succeeds; and a drop that records its calls. */
function harness(failures = 0) {
    const log: string[] = [];
    let left = failures;
    const save = vi.fn(async () => {
        await Promise.resolve();
        if (left-- > 0) {
            log.push('save-failed');
            throw new Error('network');
        }
        log.push('saved');
    });
    const drop = vi.fn(async (id: string): Promise<DropResult> => {
        log.push(`drop:${id}`);
        return 'deleted';
    });
    return { log, save, drop };
}

describe('OM75 (2) embeddingTextChanged', () => {
    it('a title, ingredient or method change marks the vector stale', () => {
        expect(embeddingTextChanged(stored, { ...stored, title: 'Penne' })).toBe(true);
        expect(embeddingTextChanged(stored, { ...stored, ingredients: 'pasta\nbasil' })).toBe(true);
        expect(embeddingTextChanged(stored, { ...stored, instructions: 'Boil well.' })).toBe(true);
        expect(embeddingTextChanged(undefined, stored)).toBe(true);
    });

    it('a save that leaves that text alone (notes, rating, photo) keeps the vector', () => {
        expect(embeddingTextChanged(stored, { ...stored })).toBe(false);
        expect(embeddingTextChanged(stored, { ...stored, notes: 'new' } as typeof stored)).toBe(false);
    });
});

describe('OM75 (2) saveThenDropStale', () => {
    it('a failed save then a successful retry of the same edit drops the vector (review MUST)', async () => {
        const persisted = { current: stored };
        const edit = { ...stored, ingredients: 'pasta\nbasil' };
        const { log, save, drop } = harness(1);

        await expect(saveThenDropStale(persisted, edit, save, drop)).rejects.toThrow('network');
        expect(drop).not.toHaveBeenCalled();
        expect(persisted.current).toBe(stored);  // still the stored version, not the failed edit

        expect(await saveThenDropStale(persisted, edit, save, drop)).toBe('deleted');
        expect(drop).toHaveBeenCalledTimes(1);
        expect(drop).toHaveBeenCalledWith('r1');
        expect(persisted.current).toBe(edit);
        expect(log).toEqual(['save-failed', 'saved', 'drop:r1']);
    });

    it('a notes-only save keeps the vector', async () => {
        const persisted = { current: stored };
        const { save, drop } = harness();
        expect(await saveThenDropStale(persisted, { ...stored, notes: 'new' }, save, drop)).toBe('kept');
        expect(save).toHaveBeenCalledTimes(1);
        expect(drop).not.toHaveBeenCalled();
    });

    it('drops only after the update has succeeded, never on a failed one', async () => {
        const edit = { ...stored, title: 'Penne' };
        const ok = harness();
        await saveThenDropStale({ current: stored }, edit, ok.save, ok.drop);
        expect(ok.log).toEqual(['saved', 'drop:r1']);

        const bad = harness(5);
        await expect(saveThenDropStale({ current: stored }, edit, bad.save, bad.drop)).rejects.toThrow();
        expect(bad.log).toEqual(['save-failed']);
        expect(bad.drop).not.toHaveBeenCalled();
    });

    it('a second edit after a successful one is diffed against the new stored text', async () => {
        const persisted = { current: stored };
        const edit = { ...stored, title: 'Penne' };
        const { save, drop } = harness();
        await saveThenDropStale(persisted, edit, save, drop);
        expect(await saveThenDropStale(persisted, { ...edit, notes: 'x' }, save, drop)).toBe('kept');
        expect(drop).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: the retry after a failed save is not a no-op for the vector', async () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the review's bug: the retry
        // diffed against the optimistic (already edited) state, saw no change, and dropped nothing.
        const persisted = { current: stored };
        const edit = { ...stored, instructions: 'Boil well.' };
        const { save, drop } = harness(1);
        await saveThenDropStale(persisted, edit, save, drop).catch(() => undefined);
        await saveThenDropStale(persisted, edit, save, drop);
        rejectWrong(drop.mock.calls.length, 0);
    });
});

describe('OM75 (2) dropStaleEmbedding', () => {
    it("deletes exactly that recipe's row and asks for it back", async () => {
        const { client, calls } = fakeClient({ data: [{ recipe_id: 'abc' }], error: null });
        expect(await dropStaleEmbedding(client, 'abc')).toBe('deleted');
        expect(calls).toEqual([{ table: 'recipe_embeddings', column: 'recipe_id', value: 'abc', returning: 'recipe_id' }]);
    });

    it('zero rows back (no vector yet, or RLS filtered it) is "none" and logs a warning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await dropStaleEmbedding(fakeClient({ data: [], error: null }).client, 'abc')).toBe('none');
        expect(await dropStaleEmbedding(fakeClient({ data: null, error: null }).client, 'abc')).toBe('none');
        expect(warn).toHaveBeenCalledTimes(2);
        expect(String(warn.mock.calls[0][0])).toContain('abc');
    });

    it('a failed delete never fails the save: it reports "failed" and does not throw', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await dropStaleEmbedding(fakeClient({ data: null, error: { message: 'rls' } }).client, 'abc')).toBe('failed');
        expect(await dropStaleEmbedding(fakeClient(new Error('offline')).client, 'abc')).toBe('failed');
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
