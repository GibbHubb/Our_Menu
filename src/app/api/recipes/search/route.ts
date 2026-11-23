// Semantic recipe search (OM1). OM68: embeds the query with Gemini (src/lib/embeddings.ts,
// GEMINI_API_KEY), then ranks with the match_recipes RPC from migration 001.

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';
import { embedText } from '@/lib/embeddings';
import { aiFeatureOffError } from '@/lib/aiFeatures';

export async function POST(req: NextRequest) {
    // OM73 — signed-in callers only: each search spends a Gemini embedding call.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    let query: unknown;
    try {
        ({ query } = await req.json());
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

    // OM14c — search the caller's own recipes, not the anonymous view.
    const supabase = createRequestClient(req);

    const off = aiFeatureOffError('search', 'Semantic search is');  // OM72
    if (off) return NextResponse.json({ error: off }, { status: 503 });

    let embedding: number[];
    try {
        embedding = await embedText(String(query), 'RETRIEVAL_QUERY');
    } catch (e) {
        console.error('recipes/search embedding failed:', e);
        return NextResponse.json({ error: 'Semantic search is unavailable right now.' }, { status: 502 });
    }

    // Call match_recipes RPC
    const { data, error } = await supabase.rpc('match_recipes', {
        query_embedding: embedding,
        match_count: 5,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch full recipe data for matched IDs
    const ids = (data ?? []).map((r: { recipe_id: string }) => r.recipe_id);
    if (!ids.length) return NextResponse.json({ results: [] });

    const { data: recipes, error: recErr } = await supabase
        .from('recipes')
        .select('*')
        .in('id', ids);

    return NextResponse.json({ results: recipes ?? [], error: recErr?.message });
}
