// OM36 — stop the Supabase project pausing itself.
//
// Supabase's free tier pauses a project after 7 consecutive days with no
// database or API activity, and restoring it is a manual click in the
// dashboard. Our_Menu has two users who go a week without opening it often
// enough that the app was effectively "broken by default" — every visit after
// a quiet week hit a paused database.
//
// The fix is to make sure the project is never quiet for 7 days: a Vercel cron
// (see vercel.json) calls this route once a day, and the route issues one
// trivial query. Any real request to PostgREST resets the inactivity clock, so
// the query does not need to return rows — it only needs to reach the DB.
//
// Deliberately uses the anon key, not the service role: RLS may return zero
// rows here and that is fine. Nothing about this route needs privilege.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Never let Next cache this — a cached response would not touch the database,
// which is the entire point of the route.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    // Vercel signs cron invocations with CRON_SECRET when the env var is set.
    // Optional by design: the route is harmless if called by anyone, so an
    // unset secret must not break the keepalive.
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const header = req.headers.get('authorization');
        if (header !== `Bearer ${secret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        return NextResponse.json(
            { ok: false, error: 'Supabase env vars missing — keepalive cannot reach the database' },
            { status: 503 },
        );
    }

    const supabase = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // `head: true` sends the query without transferring rows. RLS decides what
    // the count covers; a zero count is still a successful round trip.
    const { count, error } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true });

    if (error) {
        console.error('Keepalive query failed:', error.message);
        return NextResponse.json(
            { ok: false, error: error.message, at: new Date().toISOString() },
            { status: 503 },
        );
    }

    return NextResponse.json({
        ok: true,
        visibleRecipes: count ?? 0,
        at: new Date().toISOString(),
    });
}
