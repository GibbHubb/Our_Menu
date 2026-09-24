// OM61 — the client-side half of "nothing tells us the app broke except Max
// noticing". Every uncaught error in the browser (a render error the
// ErrorBoundary catches, an unhandled exception, an unhandled promise
// rejection) is posted here and lands as one row in `public.client_errors`.
//
// Deliberately the smallest thing that works: no SDK, no bundle weight, no
// data leaving the project (plan §5). The insert itself is capped and
// RLS-gated server-side (migration 026); this module adds a second,
// client-side belt: a per-session cap so a render loop can't spam the
// network, and a message-length cap so a huge stack doesn't ship megabytes.
//
// The one hard rule: this NEVER reports its own failure. A reporter that
// reports itself is the flood risk called out in the plan's §8 risk list.

import { apiFetch } from './apiFetch';

const MAX_MESSAGE = 2000;
const MAX_STACK = 2000;
const MAX_PER_SESSION = 10;
const SESSION_KEY = 'om-client-error-count';

function underSessionCap(): boolean {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        const count = raw ? parseInt(raw, 10) : 0;
        if (Number.isNaN(count) || count >= MAX_PER_SESSION) return false;
        sessionStorage.setItem(SESSION_KEY, String(count + 1));
        return true;
    } catch {
        // sessionStorage unavailable (private mode, etc.) — allow the report,
        // there is no counter to enforce and the server-side cap still holds.
        return true;
    }
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + '…' : s;
}

export function reportClientError(source: string, error: unknown, extra?: Record<string, unknown>): void {
    try {
        if (!underSessionCap()) return;

        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack || '' : '';

        const body = {
            source,
            message: truncate(message, MAX_MESSAGE),
            stack_head: truncate(stack, MAX_STACK),
            route: typeof window !== 'undefined' ? window.location.pathname : '',
            ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            ...extra,
        };

        // Fire-and-forget. Never awaited, never lets a reporting failure
        // become a second error — that is exactly the loop risk this ticket
        // flags. void + .catch(noop) on purpose.
        void apiFetch('/api/client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch(() => { /* the reporter does not report itself */ });
    } catch {
        // Same rule, for synchronous failures (e.g. JSON.stringify on a
        // circular extra object) — swallow, never throw, never re-report.
    }
}
