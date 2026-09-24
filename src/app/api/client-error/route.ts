// OM61 — write-only sink for uncaught client errors.
//
// Posted to by ErrorBoundary.tsx (render errors) and
// ClientErrorReporterMount.tsx (window.onerror / unhandledrejection). Never
// read from the browser — reading a row back is a service-role job (AC4's
// verification step), not something this route offers.
//
// Two caps, belt and braces with the client-side ones in
// clientErrorReporter.ts and the CHECK constraints in migration 026:
//   - oversized bodies are dropped before they reach Postgres at all
//   - a simple per-minute-per-IP counter so a render loop hitting this route
//     directly (bypassing the client's own session cap) can't flood the
//     table. In-memory, so it resets on every cold start — that is a known
//     limitation of a single Vercel function instance, not a promise of a
//     hard ceiling; the CHECK constraints and RLS are what actually bound
//     the damage.

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient } from '@/lib/supabaseServer';

// 16k, not 8k: the client truncates `message` by UTF-16 code units (2,000)
// while this cap counts UTF-8 BYTES, so an accented or emoji-bearing message
// could pass the client cap and still be dropped here — losing exactly the
// report this route exists to keep (review, 2026-09-24). The column CHECKs
// in migration 026 are what actually bound a row.
const MAX_BODY_BYTES = 16_000;
const RATE_LIMIT_PER_MINUTE = 20;

// Module-level state persists only for the lifetime of one warm serverless
// instance — see the limitation noted above.
const hits = new Map<string, { count: number; windowStart: number }>();

function underRateLimit(key: string): boolean {
    const now = Date.now();
    pruneHits(now);
    const windowMs = 60_000;
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
        hits.set(key, { count: 1, windowStart: now });
        return true;
    }
    entry.count += 1;
    return entry.count <= RATE_LIMIT_PER_MINUTE;
}

/** Drop windows that have expired, so `hits` cannot grow per distinct IP for the
 *  life of a warm instance (review, 2026-09-24). Cheap: the map is tiny. */
function pruneHits(now: number): void {
    for (const [key, entry] of hits) {
        if (now - entry.windowStart > 60_000) hits.delete(key);
    }
}

function clientKey(req: NextRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(req: NextRequest) {
    const raw = await req.text();
    // Code-review finding: `raw.length` is a UTF-16 code-unit count, not a
    // byte count — a message full of accented characters or emoji can be
    // ~2-4x that many real bytes, silently blowing past what "8,000 bytes"
    // is supposed to mean. Measure what the name says.
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
        return NextResponse.json({ ok: false, dropped: 'oversized' }, { status: 413 });
    }

    if (!underRateLimit(clientKey(req))) {
        return NextResponse.json({ ok: false, dropped: 'rate-limited' }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
        body = JSON.parse(raw);
    } catch {
        return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
    }

    const source = typeof body.source === 'string' ? body.source.slice(0, 100) : 'unknown';
    const message = typeof body.message === 'string' ? body.message.slice(0, 2200) : '';
    if (!message) {
        return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 });
    }

    const sb = createRequestClient(req);
    // 🔴 RLS's WITH CHECK only PERMITS `user_id = auth.uid() OR user_id IS NULL`
    // — it does not fill the column in. Omitting it left every row anonymous,
    // including for signed-in users (review, 2026-09-24). Taken from the
    // caller's own verified token, never from the request body.
    const { data: auth } = await sb.auth.getUser();
    const { error } = await sb.from('client_errors').insert({
        user_id: auth?.user?.id ?? null,
        source,
        message,
        stack_head: typeof body.stack_head === 'string' ? body.stack_head.slice(0, 2200) : null,
        // Code-review finding: ErrorBoundary.tsx sends componentStack (which
        // component broke) but this used to have nowhere to go and was
        // dropped. migration 026 added the column; read it here.
        component_stack: typeof body.componentStack === 'string' ? body.componentStack.slice(0, 1000) : null,
        route: typeof body.route === 'string' ? body.route.slice(0, 300) : null,
        ua: typeof body.ua === 'string' ? body.ua.slice(0, 500) : null,
    });

    if (error) {
        // Deliberately does NOT call reportClientError on itself — that is
        // the loop this route exists to avoid causing.
        console.error('client-error insert failed:', error.message);
        return NextResponse.json({ ok: false }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
}
