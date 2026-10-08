// OM60 — the offline cache and tick queue, without a browser.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    enqueueTick, pendingTicks, applyPending, flushTicks, clearOfflineData,
    saveListCache, readListCache,
} from '@/lib/offline';
import type { ListRow } from '@/lib/shopping';
import { rejectWrong } from './control';

function fakeStorage() {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); },
        key: (i: number) => [...m.keys()][i] ?? null,
        get length() { return m.size; },
        _m: m,
    };
}

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => { store = fakeStorage(); vi.stubGlobal('window', { localStorage: store }); });
afterEach(() => { vi.unstubAllGlobals(); });

const row: ListRow = { id: 'r1', label: 'tomatoes', item_key: 'tomato', qty_base: 2, family: 'count', unit_hint: 'can' };

describe('queue', () => {
    it('keeps only the last state per line', () => {
        enqueueTick('u', 'extra:1', true);
        enqueueTick('u', 'extra:2', true);
        enqueueTick('u', 'extra:1', false);
        expect(pendingTicks('u').map((t) => [t.key, t.checked])).toEqual([['extra:2', true], ['extra:1', false]]);
    });
    it('is per user', () => {
        enqueueTick('a', 'extra:1', true);
        expect(pendingTicks('b')).toEqual([]);
    });
    it('applyPending lays queued ticks over the server set', () => {
        const out = applyPending(new Set(['extra:1', 'extra:3']), [
            { key: 'extra:1', checked: false, at: '' }, { key: 'extra:2', checked: true, at: '' },
        ]);
        expect([...out].sort()).toEqual(['extra:2', 'extra:3']);
    });
});

describe('flushTicks', () => {
    it('5 queued -> 5 landed -> 0 remaining', async () => {
        for (let i = 1; i <= 5; i++) enqueueTick('u', `extra:${i}`, true);
        const sent: string[] = [];
        const res = await flushTicks('u', async (k) => { sent.push(k); return true; });
        expect(res).toEqual({ landed: 5, remaining: 0, failed: false });
        expect(sent).toHaveLength(5);
        expect(pendingTicks('u')).toEqual([]);
    });
    it('stops at the first failure and keeps it and everything after it', async () => {
        for (let i = 1; i <= 4; i++) enqueueTick('u', `extra:${i}`, true);
        const res = await flushTicks('u', async (k) => k !== 'extra:3');
        expect(res).toEqual({ landed: 2, remaining: 2, failed: true });
        expect(pendingTicks('u').map((t) => t.key)).toEqual(['extra:3', 'extra:4']);
    });
    it('a send that throws counts as a failure, not a crash', async () => {
        enqueueTick('u', 'extra:1', true);
        const res = await flushTicks('u', async () => { throw new Error('network'); });
        expect(res.failed).toBe(true);
        expect(pendingTicks('u')).toHaveLength(1);
    });
    it('a tick made during the flush is not overwritten', async () => {
        enqueueTick('u', 'extra:1', true);
        await flushTicks('u', async () => { enqueueTick('u', 'extra:9', true); return true; });
        expect(pendingTicks('u').map((t) => t.key)).toEqual(['extra:9']);
    });
    it('CONTROL: a failed send never drops the queue', async () => {
        enqueueTick('u', 'extra:1', true);
        const res = await flushTicks('u', async () => false);
        rejectWrong(res.remaining, 0);
    });
});

describe('list cache and sign-out', () => {
    it('round-trips rows, ticks and the clock', () => {
        saveListCache('u', [row], new Set(['extra:r1']), new Date('2026-10-01T10:00:00Z'));
        const c = readListCache('u')!;
        expect(c.rows).toEqual([row]);
        expect(c.ticks).toEqual(['extra:r1']);
        expect(c.lastAt).toBe('2026-10-01T10:00:00.000Z');
    });
    it('clearOfflineData removes every om60 key and nothing else', () => {
        saveListCache('u', [row], new Set(), null);
        enqueueTick('u', 'extra:1', true);
        store.setItem('om27_unit_system', 'us');
        clearOfflineData();
        expect([...store._m.keys()]).toEqual(['om27_unit_system']);
    });
    it('broken storage degrades instead of throwing', () => {
        vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } } });
        expect(enqueueTick('u', 'extra:1', true)).toBe(false);
        expect(pendingTicks('u')).toEqual([]);
        expect(readListCache('u')).toBeNull();
        expect(() => clearOfflineData()).not.toThrow();
    });
});
