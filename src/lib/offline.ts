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
// Every storage access is wrapped: Safari private mode, a full quota or a
// disabled storage must degrade to the pre-OM60 behaviour, never throw.

import { useSyncExternalStore } from "react";
import type { ListRow } from "./shopping";

const PREFIX = "om60:";
const listKey = (uid: string) => `${PREFIX}list:${uid}`;
const queueKey = (uid: string) => `${PREFIX}queue:${uid}`;

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

// ── the pending-tick queue ─────────────────────────────────────────────────

export interface PendingTick { key: string; checked: boolean; at: string }

export function pendingTicks(uid: string): PendingTick[] {
    const q = read<PendingTick[]>(queueKey(uid));
    return Array.isArray(q) ? q : [];
}

/** Queue a tick; a later tick of the same line replaces the earlier one. */
export function enqueueTick(uid: string, key: string, checked: boolean): boolean {
    const q = pendingTicks(uid).filter((t) => t.key !== key);
    q.push({ key, checked, at: new Date().toISOString() });
    return write(queueKey(uid), q);
}

/** The tick set as the user last saw it: server ticks with the queue on top. */
export function applyPending(ticks: Set<string>, pending: PendingTick[]): Set<string> {
    const out = new Set(ticks);
    for (const t of pending) {
        if (t.checked) out.add(t.key); else out.delete(t.key);
    }
    return out;
}

export interface FlushResult { landed: number; remaining: number; failed: boolean }

/**
 * Replay the queue in order through `send`, which must resolve true only when
 * the write landed. Stops at the first failure and KEEPS that entry and every
 * one after it: a queue that drops entries on error is worse than no queue.
 */
export async function flushTicks(
    uid: string, send: (key: string, checked: boolean) => Promise<boolean>,
): Promise<FlushResult> {
    const q = pendingTicks(uid);
    let landed = 0;
    for (const t of q) {
        let ok = false;
        try { ok = await send(t.key, t.checked); } catch { ok = false; }
        if (!ok) return { landed, remaining: pendingTicks(uid).length, failed: true };
        landed++;
        // Remove exactly the entry that landed, re-reading the queue each
        // time: a tick made WHILE we flush must not be overwritten, and a
        // newer state for the same line (different `at`) must stay queued.
        write(queueKey(uid), pendingTicks(uid).filter((x) => !(x.key === t.key && x.at === t.at)));
    }
    return { landed, remaining: pendingTicks(uid).length, failed: false };
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
