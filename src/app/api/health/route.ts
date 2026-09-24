// OM61 — the honest version of /api/keepalive.
//
// keepalive.yml only asserts `status == 200`, and the keepalive route
// (route.ts) returns 200 even on some of its own failure paths were it not
// careful — this route exists specifically so a monitor can tell "the app
// works" from "the app answered". Every check below returns a non-200 status
// the moment anything is wrong, on purpose: a green run here has to mean
// something, because the whole point of OM61 is that nothing else does.
//
// Three checks:
//   db    — the same round-trip keepalive already proves (recipes count,
//           anon key, RLS applies).
//   auth  — GoTrue's own /auth/v1/health endpoint answers. Confirms the
//           magic-link sign-in path has somewhere to land, which the db
//           check alone can't tell you (Postgres can be up while GoTrue is
//           not, and vice versa).
//   build — not pass/fail, just evidence: which deploy is answering, via
//           VERCEL_GIT_COMMIT_SHA. This is what turns "it's broken" into
//           "it broke in this deploy" (plan §5).
//
// `ok` is db.up && auth.up. A caller that only checks the HTTP status still
// gets the right answer; a caller that reads the body gets to say which
// check failed.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CheckStatus = 'up' | 'down' | 'unconfigured';

async function checkDb(url: string, anonKey: string): Promise<{ status: CheckStatus; detail?: string }> {
    const supabase = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Deliberately NOT `{ count: 'exact', head: true }` like keepalive/route.ts
    // uses: proving this route in step 1 (OM61) found that combination is
    // blind. A HEAD request has no body, and when the target table doesn't
    // exist PostgREST's 404 comes back to supabase-js as `{ error: null,
    // status: 204 }` — indistinguishable from "table exists, zero rows".
    // keepalive inherits the same blind spot; that is a follow-up (filed
    // separately at complete time), not fixed here, because it needs its own
    // step-1-style proof before editing
    // a check that has run in production since OM36. `select('id').limit(1)`
    // has a body on every response and correctly surfaces PGRST205.
    const { error } = await supabase.from('recipes').select('id').limit(1);
    if (error) return { status: 'down', detail: error.message };
    return { status: 'up' };
}

async function checkAuth(url: string, anonKey: string): Promise<{ status: CheckStatus; detail?: string }> {
    try {
        const res = await fetch(`${url}/auth/v1/health`, {
            headers: { apikey: anonKey },
            cache: 'no-store',
        });
        if (!res.ok) return { status: 'down', detail: `HTTP ${res.status}` };
        return { status: 'up' };
    } catch (e) {
        return { status: 'down', detail: e instanceof Error ? e.message : 'fetch failed' };
    }
}

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const commit = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
    const at = new Date().toISOString();

    if (!url || !anonKey) {
        return NextResponse.json(
            {
                ok: false,
                checks: { db: 'unconfigured', auth: 'unconfigured', build: 'unconfigured' },
                commit,
                at,
                error: 'Supabase env vars missing',
            },
            { status: 503 },
        );
    }

    const [db, auth] = await Promise.all([checkDb(url, anonKey), checkAuth(url, anonKey)]);
    const ok = db.status === 'up' && auth.status === 'up';

    return NextResponse.json(
        {
            ok,
            checks: {
                db: db.status,
                auth: auth.status,
                build: commit === 'unknown' ? 'unconfigured' : 'up',
            },
            commit,
            at,
            ...(db.detail ? { dbError: db.detail } : {}),
            ...(auth.detail ? { authError: auth.detail } : {}),
        },
        { status: ok ? 200 : 503 },
    );
}
