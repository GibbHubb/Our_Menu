// Requires: OPENAI_API_KEY in .env.local
// Requires: 001_recipe_embeddings.sql applied in Supabase (match_recipes RPC)

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

    // Embed the query
    const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
    });
    const embedding = embRes.data[0].embedding;

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
