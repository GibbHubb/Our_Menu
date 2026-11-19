// OM60 review (2026-11-17) — each case is a finding from the review, written
// so it fails on the pre-fix offline.ts (e4ac6d7) and passes after.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    enqueueTick, pendingTicks, flushTicks, recordTick, settleTick, pruneTicks, rowVersion,
    retryDelayMs, classifyWriteError, shouldClearOnAuthEvent, confirmSignOut, formatSavedAt,
    MAX_TICK_AGE_MS, MAX_ATTEMPTS, type WriteResult,
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
    };
}
beforeEach(() => { vi.stubGlobal('window', { localStorage: fakeStorage() }); });
afterEach(() => { vi.unstubAllGlobals(); });

const MILK = 'extra:milk';
const milk: ListRow = { id: 'milk', label: 'milk', item_key: 'milk', qty_base: 2000, family: 'volume', unit_hint: 'l' };

/** A fake server: the ticks table, and a switch for the signal. */
function server() {
    const ticks = new Map<string, boolean>();
    const s = {
        ticks, up: true, sent: [] as string[],
        send: async (k: string, c: boolean): Promise<WriteResult> => {
            if (!s.up) return 'retry';
            s.sent.push(k); ticks.set(k, c); return 'ok';
        },
    };
    return s;
}

describe('HIGH: a stale queued tick never overrides a newer live tick', () => {
    it('tick fails -> queued; untick while back online; the flush leaves Milk UNticked', async () => {
        const srv = server();
        srv.up = false;
        await recordTick('u', MILK, true, {}, { online: true, busy: false, send: srv.send });
        srv.up = true;
        await recordTick('u', MILK, false, {}, { online: true, busy: false, send: srv.send });
        await flushTicks('u', srv.send);
        expect(srv.ticks.get(MILK)).toBe(false);
        expect(pendingTicks('u')).toEqual([]);
    });
    it('a live tick that lands settles every OLDER queued state for its line', () => {
        enqueueTick('u', MILK, true, { seq: 100 });
        enqueueTick('u', 'extra:eggs', true, { seq: 101 });
        expect(settleTick('u', MILK, 200)).toBe(1);
        expect(pendingTicks('u').map((t) => t.key)).toEqual(['extra:eggs']);
    });
    it('…but not a NEWER tap of the same line queued while it was in flight', () => {
        enqueueTick('u', MILK, false, { seq: 300 });
        expect(settleTick('u', MILK, 200)).toBe(0);
        expect(pendingTicks('u')).toHaveLength(1);
    });
    it('a live write that fails late does not overwrite a newer queued tap', () => {
        enqueueTick('u', MILK, false, { seq: 300 });
        enqueueTick('u', MILK, true, { seq: 200 });
        expect(pendingTicks('u').map((t) => t.checked)).toEqual([false]);
    });
    it('a tap while a flush runs (busy) is queued, not raced live', async () => {
        const srv = server();
        expect(await recordTick('u', MILK, true, {}, { online: true, busy: true, send: srv.send })).toBe('queued');
        expect(srv.sent).toEqual([]);
    });
});

describe('MEDIUM: queued ticks expire and do not land on a changed line', () => {
    const now = Date.parse('2026-11-17T12:00:00Z');
    it(`a tick older than ${MAX_TICK_AGE_MS / 3_600_000} h is dropped and reported, not replayed`, async () => {
        const srv = server();
        enqueueTick('u', MILK, true, { seq: now - MAX_TICK_AGE_MS - 1, label: 'milk' });
        const res = await flushTicks('u', srv.send, { now });
        expect(srv.sent).toEqual([]);
        expect(res.dropped).toEqual([{ key: MILK, checked: true, label: 'milk', reason: 'expired' }]);
        expect(pendingTicks('u')).toEqual([]);
    });
    it('a tick inside the bound is still replayed', async () => {
        const srv = server();
        enqueueTick('u', MILK, true, { seq: now - MAX_TICK_AGE_MS + 60_000 });
        await flushTicks('u', srv.send, { now });
        expect(srv.sent).toEqual([MILK]);
    });
    it('not replayed onto a line whose amount changed since (recipe merge)', async () => {
        const srv = server();
        enqueueTick('u', MILK, true, { seq: now, ver: rowVersion(milk) });
        const grown = new Map([[MILK, rowVersion({ ...milk, qty_base: 3000 })]]);
        const res = await flushTicks('u', srv.send, { now, current: grown });
        expect(srv.sent).toEqual([]);
        expect(res.dropped.map((d) => d.reason)).toEqual(['changed']);
    });
    it('not replayed onto a line that has left the list', async () => {
        const srv = server();
        enqueueTick('u', MILK, true, { seq: now, ver: rowVersion(milk) });
        const res = await flushTicks('u', srv.send, { now, current: new Map() });
        expect(srv.sent).toEqual([]);
        expect(res.dropped.map((d) => d.reason)).toEqual(['removed']);
    });
    it('an unchanged line is replayed', async () => {
        const srv = server();
        enqueueTick('u', MILK, true, { seq: now, ver: rowVersion(milk) });
        await flushTicks('u', srv.send, { now, current: new Map([[MILK, rowVersion(milk)]]) });
        expect(srv.sent).toEqual([MILK]);
    });
    it('pruneTicks (used at load, also offline) drops expired entries', () => {
        enqueueTick('u', MILK, true, { seq: now - MAX_TICK_AGE_MS - 1 });
        expect(pruneTicks('u', { now }).map((d) => d.reason)).toEqual(['expired']);
        expect(pendingTicks('u')).toEqual([]);
    });
});

describe('MEDIUM: retry while "online"', () => {
    it('backs off 5 s, 10 s, 20 s … capped at 60 s', () => {
        expect([0, 1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
    });
    it('a network failure is a retry; the server refusing is gone; a 500 is an error', () => {
        expect(classifyWriteError(null)).toBe('ok');
        expect(classifyWriteError({ status: 0, code: '' })).toBe('retry');
        expect(classifyWriteError({ status: 401, code: 'PGRST301' })).toBe('retry');
        expect(classifyWriteError({ status: 403, code: '42501' })).toBe('gone');
        expect(classifyWriteError({ status: 400, code: '23502' })).toBe('gone');
        expect(classifyWriteError({ status: 409, code: '23503' })).toBe('gone');
        expect(classifyWriteError({ status: 500, code: '' })).toBe('error');
    });
});

describe('MEDIUM: a tick that can never land does not block the queue', () => {
    it('a refused tick is dropped and reported, and the ones behind it still land', async () => {
        for (const k of ['extra:a', 'extra:b', 'extra:c']) enqueueTick('u', k, true, { label: k.slice(6) });
        const res = await flushTicks('u', async (k) => (k === 'extra:a' ? 'gone' : 'ok'));
        expect(res.landed).toBe(2);
        expect(res.remaining).toBe(0);
        expect(res.failed).toBe(false);
        expect(res.dropped).toEqual([{ key: 'extra:a', checked: true, label: 'a', reason: 'refused' }]);
    });
    it(`a server error is retried, then dropped after ${MAX_ATTEMPTS} attempts`, async () => {
        enqueueTick('u', 'extra:a', true);
        enqueueTick('u', 'extra:b', true);
        const send = async (k: string): Promise<WriteResult> => (k === 'extra:a' ? 'error' : 'ok');
        for (let i = 1; i < MAX_ATTEMPTS; i++) {
            const r = await flushTicks('u', send);
            expect(r.failed).toBe(true);
            expect(pendingTicks('u')).toHaveLength(2);
        }
        const last = await flushTicks('u', send);
        expect(last.dropped.map((d) => d.key)).toEqual(['extra:a']);
        expect(last.landed).toBe(1);
        expect(pendingTicks('u')).toEqual([]);
    });
    it('a network failure never counts toward the cap (only expiry ends it)', async () => {
        enqueueTick('u', 'extra:a', true);
        for (let i = 0; i < MAX_ATTEMPTS * 3; i++) await flushTicks('u', async () => 'retry');
        expect(pendingTicks('u')).toHaveLength(1);
    });
    it('a live tick the server refuses is not queued', async () => {
        expect(await recordTick('u', MILK, true, {}, { online: true, busy: false, send: async () => 'gone' })).toBe('refused');
        expect(pendingTicks('u')).toEqual([]);
    });
});

describe('LOW: sign-out and the saved-copy banner', () => {
    it('an expired session (SIGNED_OUT from onAuthStateChange) clears the cache; other events do not', () => {
        expect(shouldClearOnAuthEvent('SIGNED_OUT')).toBe(true);
        expect(shouldClearOnAuthEvent('TOKEN_REFRESHED')).toBe(false);
        expect(shouldClearOnAuthEvent('SIGNED_IN')).toBe(false);
        expect(shouldClearOnAuthEvent('INITIAL_SESSION')).toBe(false);
    });
    it('sign-out with nothing unsent does not ask', () => {
        const ask = vi.fn(() => false);
        expect(confirmSignOut(ask)).toBe(true);
        expect(ask.mock.calls).toHaveLength(0);
    });
    it('sign-out with unsent ticks asks, says how many, and respects the answer', () => {
        enqueueTick('u', 'extra:a', true);
        enqueueTick('u', 'extra:b', true);
        let asked = '';
        expect(confirmSignOut((m) => { asked = m; return false; })).toBe(false);
        expect(asked).toMatch(/^2 ticks haven't reached the server/);
        expect(confirmSignOut(() => true)).toBe(true);
    });
    it('the banner shows only the time for a copy saved today', () => {
        const now = new Date(2026, 10, 17, 18, 0);
        expect(formatSavedAt(new Date(2026, 10, 17, 14, 5).toISOString(), now, 'en-AU')).toMatch(/^\d{1,2}:05\s?(am|pm)?$/i);
    });
    it('…and the date as well for an older one', () => {
        const now = new Date(2026, 10, 17, 18, 0);
        const s = formatSavedAt(new Date(2026, 10, 10, 14, 5).toISOString(), now, 'en-AU');
        expect(s).toMatch(/Tue/);
        expect(s).toMatch(/10/);
        expect(s).toMatch(/Nov/);
        expect(s).toMatch(/:05/);
    });
    it('CONTROL: an old copy never reads as just a time', () => {
        const now = new Date(2026, 10, 17, 18, 0);
        const s = formatSavedAt(new Date(2026, 10, 10, 14, 5).toISOString(), now, 'en-AU');
        rejectWrong(/^\d{1,2}:05\s?(am|pm)?$/i.test(s), true);
    });
});
