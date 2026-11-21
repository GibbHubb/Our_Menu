// Semantic recipe search (OM1). OM68: embeds the query with Gemini (src/lib/embeddings.ts,
// GEMINI_API_KEY), then ranks with the match_recipes RPC from migration 001.

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient } from '@/lib/supabaseServer';
import { embedText, embeddingsConfigured } from '@/lib/embeddings';

export async function POST(req: NextRequest) {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

    // OM14c — search the caller's own recipes, not the anonymous view.
    const supabase = createRequestClient(req);

    if (!embeddingsConfigured()) {
        return NextResponse.json({ error: 'Semantic search is not configured (GEMINI_API_KEY missing)' }, { status: 503 });
    }

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
