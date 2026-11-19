// OM60 — the shopping list in the one place the signal drops.
//
// No service worker, deliberately (PROJECTS.md / LESSONS RAG19: a stale SW
// locking users behind a white screen). This is localStorage plus the
// browser's own online/offline events, which cannot white-screen anything
// because nothing intercepts the network.
//
//   cache-on-read   every good list fetch is saved per user; a failed fetch
//                   falls back to it, and the page SAYS it is showing a copy
//   queue-on-write  a tick that cannot reach the server is kept in a per-user
//                   queue and replayed later. A tick is an upsert of
//                   (line_key, checked), so replaying it is idempotent, and
//                   the queue keeps only the LAST state per line.
//
// Review fixes (2026-11-17):
//   - a tick that lands live settles (drops) every OLDER queued state for that
//     line, so a flush can never replay an old tick over a newer one
//     (`recordTick`, `settleTick`); a line with a queued state is never written
//     live, it goes through the queue so the two paths cannot race
//   - a queued tick expires after MAX_TICK_AGE_MS, and is not replayed onto a
//     line that has left the list or whose amount/label changed since (`ver`)
//   - a write the server REFUSES (403, RLS, no household) is dropped and
//     reported instead of blocking the queue; a server error is retried up to
//     MAX_ATTEMPTS, a network failure until the tick expires
//
// Every storage access is wrapped: Safari private mode, a full quota or a
// disabled storage must degrade to the pre-OM60 behaviour, never throw.

import { useSyncExternalStore } from "react";
import type { ListRow } from "./shopping";

const PREFIX = "om60:";
const QUEUE_PREFIX = `${PREFIX}queue:`;
const listKey = (uid: string) => `${PREFIX}list:${uid}`;
const queueKey = (uid: string) => `${QUEUE_PREFIX}${uid}`;

function read<T>(key: string): T | null {
    try {
        const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function write(key: string, value: unknown): boolean {
    try {
        if (typeof window === "undefined") return false;
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

// ── the list cache ─────────────────────────────────────────────────────────

export interface CachedList {
    rows: ListRow[];
    ticks: string[];
    lastAt: string | null;
    savedAt: string;
}

export function saveListCache(uid: string, rows: ListRow[], ticks: Set<string>, lastAt: Date | null): void {
    write(listKey(uid), {
        rows, ticks: [...ticks], lastAt: lastAt ? lastAt.toISOString() : null, savedAt: new Date().toISOString(),
    } satisfies CachedList);
}

export function readListCache(uid: string): CachedList | null {
    const c = read<CachedList>(listKey(uid));
    return c && Array.isArray(c.rows) && Array.isArray(c.ticks) ? c : null;
}

/**
 * "saved 14:05" is only honest when it was today. A copy from last week has to
 * say so: "saved Mon 10 Nov, 14:05" (plus the year when it is not this year).
 */
export function formatSavedAt(iso: string, now: Date = new Date(), locale?: string): string {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return time;
    const date = d.toLocaleDateString(locale, {
        weekday: "short", day: "numeric", month: "short",
        ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    });
    return `${date}, ${time}`;
}

// ── the pending-tick queue ─────────────────────────────────────────────────

export interface PendingTick {
    key: string;
    checked: boolean;
    at: string;
    /** Monotonic stamp of the tap. Entries queued before the review fix lack it (see `seqOf`). */
    seq?: number;
    /** `rowVersion` of the line when it was ticked. */
    ver?: string;
    /** For the "couldn't send" note. */
    label?: string;
    /** Server-answered failures so far (network failures do not count). */
    attempts?: number;
}

/**
 * How long a queued tick stays worth sending: 3 hours.
 *
 * A tick is a statement about a trip in progress. A trip closes itself after
 * AUTO_FINISH_MS (15 min) of nobody touching the list, so 3 h covers the shop,
 * the drive home and a phone that sat on no signal for the afternoon, many times
 * over. Longer and the tick starts landing on the NEXT shop's list: the same row
 * id can still be there (it was not bought, or it was merged into), and a stale
 * tick would make the next Checked out delete something nobody has. 24 h would
 * comfortably include tomorrow morning's shop. Dropping is reported on screen,
 * so the cost of a too-short bound is one visible re-tap, not a silent loss.
 */
export const MAX_TICK_AGE_MS = 3 * 60 * 60 * 1000;
/** Server-answered errors (5xx, odd 4xx) before a tick is given up on and reported. */
export const MAX_ATTEMPTS = 6;

let lastStamp = 0;
/** Strictly increasing per page, so two taps in one millisecond still order. */
export function stamp(now: number = Date.now()): number {
    lastStamp = Math.max(now, lastStamp + 1);
    return lastStamp;
}

const seqOf = (t: PendingTick): number => t.seq ?? (Date.parse(t.at) || 0);
const same = (a: PendingTick, b: PendingTick) => a.key === b.key && seqOf(a) === seqOf(b);

/** What a queued tick is checked against before replay: the amount and the words. */
export function rowVersion(row: ListRow): string {
    return JSON.stringify([row.label, row.qty_base, row.family, row.unit_hint]);
}

export function pendingTicks(uid: string): PendingTick[] {
    const q = read<PendingTick[]>(queueKey(uid));
    return Array.isArray(q) ? q : [];
}

/** Every unsent tick on this device, any account: what a sign-out would throw away. */
export function unsentTickCount(): number {
    try {
        if (typeof window === "undefined") return 0;
        const ls = window.localStorage;
        let n = 0;
        for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (k && k.startsWith(QUEUE_PREFIX)) {
                const q = read<PendingTick[]>(k);
                if (Array.isArray(q)) n += q.length;
            }
        }
        return n;
    } catch {
        return 0;
    }
}

/**
 * Queue a tick; a later tick of the same line replaces the earlier one. A tick
 * OLDER than what is already queued for the line is ignored: a live write that
 * failed after the user had tapped again must not overwrite the newer tap.
 */
export function enqueueTick(
    uid: string, key: string, checked: boolean,
    meta: { seq?: number; ver?: string; label?: string } = {},
): boolean {
    const seq = meta.seq ?? stamp();
    const q = pendingTicks(uid);
    const existing = q.find((t) => t.key === key);
    if (existing && seqOf(existing) > seq) return true;
    const next = q.filter((t) => t.key !== key);
    next.push({ key, checked, at: new Date(seq).toISOString(), seq, ver: meta.ver, label: meta.label });
    return write(queueKey(uid), next);
}

/**
 * A tick for `key` stamped `upTo` reached the server: every queued state for
 * that line from before it is now stale and must never be replayed over it.
 */
export function settleTick(uid: string, key: string, upTo: number): number {
    const q = pendingTicks(uid);
    const keep = q.filter((t) => !(t.key === key && seqOf(t) <= upTo));
    if (keep.length !== q.length) write(queueKey(uid), keep);
    return q.length - keep.length;
}

/** The tick set as the user last saw it: server ticks with the queue on top. */
export function applyPending(ticks: Set<string>, pending: PendingTick[]): Set<string> {
    const out = new Set(ticks);
    for (const t of pending) {
        if (t.checked) out.add(t.key); else out.delete(t.key);
    }
    return out;
}

/**
 * The outcome of one write. `retry`: no answer (offline, one bar), try again.
 * `error`: the server answered with something unexpected, retry a few times.
 * `gone`: the server refused it and always will (left the household, RLS).
 */
export type WriteResult = "ok" | "retry" | "error" | "gone";

/** Map a Supabase/PostgREST error to a WriteResult. Network failures arrive as status 0. */
export function classifyWriteError(err: { status?: number; code?: string } | null | undefined): WriteResult {
    if (!err) return "ok";
    const { status, code } = err;
    // 42501 RLS / insufficient privilege; 23502 household_id null (no active
    // household: get_active_household() returned null); 23503 household gone.
    if (status === 403 || code === "42501" || code === "23502" || code === "23503") return "gone";
    if (!status || status === 401 || status === 408 || status === 429) return "retry";
    return "error";
}

export type DropReason = "expired" | "removed" | "changed" | "refused";
export interface DroppedTick { key: string; checked: boolean; label?: string; reason: DropReason }

export interface PruneOptions {
    now?: number;
    /** The live list as `extraTickKey(id) -> rowVersion(row)`, when it could be fetched. */
    current?: Map<string, string> | null;
}

function dropReason(t: PendingTick, now: number, current: Map<string, string> | null | undefined): DropReason | null {
    if (now - seqOf(t) > MAX_TICK_AGE_MS) return "expired";
    if (current) {
        if (!current.has(t.key)) return "removed";
        if (t.ver !== undefined && current.get(t.key) !== t.ver) return "changed";
    }
    return null;
}

const dropped = (t: PendingTick, reason: DropReason): DroppedTick =>
    ({ key: t.key, checked: t.checked, label: t.label, reason });

/** Remove queued ticks that must not be replayed any more, and say which. */
export function pruneTicks(uid: string, opts: PruneOptions = {}): DroppedTick[] {
    const now = opts.now ?? Date.now();
    const q = pendingTicks(uid);
    const out: DroppedTick[] = [];
    const keep = q.filter((t) => {
        const r = dropReason(t, now, opts.current);
        if (r) out.push(dropped(t, r));
        return !r;
    });
    if (out.length) write(queueKey(uid), keep);
    return out;
}

export interface FlushResult { landed: number; remaining: number; failed: boolean; dropped: DroppedTick[] }

type Send = (key: string, checked: boolean) => Promise<WriteResult | boolean>;
const norm = (r: WriteResult | boolean): WriteResult => (r === true ? "ok" : r === false ? "error" : r);

/**
 * Replay the queue in order through `send`. A network failure, or a server
 * error under MAX_ATTEMPTS, stops the flush and KEEPS that entry and every one
 * after it: a queue that drops entries on a blip is worse than no queue. A
 * refusal (`gone`) or the attempt cap drops the entry, reports it, and the
 * flush carries on so one dead tick cannot hold the rest hostage.
 */
export async function flushTicks(uid: string, send: Send, opts: PruneOptions = {}): Promise<FlushResult> {
    const out = pruneTicks(uid, opts);
    const q = pendingTicks(uid);
    let landed = 0;
    const remove = (t: PendingTick) => write(queueKey(uid), pendingTicks(uid).filter((x) => !same(x, t)));
    for (const t of q) {
        // Settled by a live tick, or replaced by a newer tap, since the snapshot.
        if (!pendingTicks(uid).some((x) => same(x, t))) continue;
        let r: WriteResult;
        try { r = norm(await send(t.key, t.checked)); } catch { r = "retry"; }
        if (r === "ok") {
            // Remove exactly the entry that landed, re-reading the queue: a
            // tick made WHILE we flush must not be overwritten, and a newer
            // state for the same line (different seq) must stay queued.
            remove(t);
            landed++;
        } else if (r === "gone") {
            remove(t);
            out.push(dropped(t, "refused"));
        } else if (r === "error" && (t.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
            remove(t);
            out.push(dropped(t, "refused"));
        } else {
            if (r === "error") {
                write(queueKey(uid), pendingTicks(uid).map((x) => (same(x, t) ? { ...x, attempts: (x.attempts ?? 0) + 1 } : x)));
            }
            return { landed, remaining: pendingTicks(uid).length, failed: true, dropped: out };
        }
    }
    return { landed, remaining: pendingTicks(uid).length, failed: false, dropped: out };
}

/** Back-off between retries while the browser says online but writes fail: 5 s doubling to 60 s. */
export function retryDelayMs(failures: number): number {
    return Math.min(5_000 * 2 ** Math.max(0, failures), 60_000);
}

/**
 * One tap on a line. Written live only when nothing about that line is queued
 * and no flush or other write is in flight (`busy`); otherwise it joins the
 * queue, so queue and live writes can never race on the same line. A live
 * write that lands settles every older queued state for the line.
 */
export async function recordTick(
    uid: string, key: string, checked: boolean,
    meta: { ver?: string; label?: string },
    deps: { online: boolean; busy: boolean; send: (key: string, checked: boolean) => Promise<WriteResult> },
): Promise<"landed" | "queued" | "refused"> {
    const seq = stamp();
    const queued = pendingTicks(uid).some((t) => t.key === key);
    if (!deps.online || deps.busy || queued) {
        enqueueTick(uid, key, checked, { seq, ...meta });
        return "queued";
    }
    let r: WriteResult;
    try { r = await deps.send(key, checked); } catch { r = "retry"; }
    if (r === "ok") { settleTick(uid, key, seq); return "landed"; }
    if (r === "gone") return "refused";
    enqueueTick(uid, key, checked, { seq, ...meta });
    return "queued";
}

/** Sign-out: nothing of this account's list stays on the device. */
export function clearOfflineData(): void {
    try {
        if (typeof window === "undefined") return;
        const ls = window.localStorage;
        for (let i = ls.length - 1; i >= 0; i--) {
            const k = ls.key(i);
            if (k && k.startsWith(PREFIX)) ls.removeItem(k);
        }
    } catch {
        /* storage unavailable: nothing was cached either */
    }
}

/**
 * A session that ends on its own (refresh token expired or revoked) arrives as
 * SIGNED_OUT from onAuthStateChange, not through our signOut(): clear then too.
 */
export function shouldClearOnAuthEvent(event: string): boolean {
    return event === "SIGNED_OUT";
}

/** Sign-out with ticks still unsent throws them away: ask first. */
export function confirmSignOut(confirm: (message: string) => boolean): boolean {
    const n = unsentTickCount();
    if (n === 0) return true;
    return confirm(
        `${n} tick${n === 1 ? " hasn't" : "s haven't"} reached the server yet. ` +
        `Signing out deletes ${n === 1 ? "it" : "them"} from this phone. Sign out anyway?`,
    );
}

// ── online / offline ───────────────────────────────────────────────────────

function subscribe(onChange: () => void): () => void {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
    };
}

/** Event-driven, not polled: flips the moment the browser says so. */
export function useOnline(): boolean {
    return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
