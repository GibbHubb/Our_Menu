// Batch-embeds the caller's recipes into recipe_embeddings (migration 001, RLS from 025).
// OM68: Gemini embeddings via src/lib/embeddings.ts (GEMINI_API_KEY), 1536 dims to fit vector(1536).

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';
import { embedText, embeddingsConfigured, recipeEmbeddingText } from '@/lib/embeddings';

export async function POST(req: NextRequest) {
    // OM55 — this used the ADMIN client with no auth at all, and returned {id, title} for every
    // recipe in every household to any anonymous caller (inert only because no LLM key exists
    // yet). Now: signed-in only, and the caller's own RLS-scoped client, so it embeds and
    // reports exactly the recipes that caller can see.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    if (!embeddingsConfigured()) {
        return NextResponse.json({ error: 'Embeddings are not configured (GEMINI_API_KEY missing)' }, { status: 503 });
    }
    const supabase = createRequestClient(req);
    // Fetch all recipes
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, ingredients, instructions');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = [];
    for (const recipe of recipes ?? []) {
        let embedding: number[];
        try {
            embedding = await embedText(recipeEmbeddingText(recipe), 'RETRIEVAL_DOCUMENT');
        } catch (e) {
            console.error(`recipes/embed failed for ${recipe.id}:`, e);
            results.push({ id: recipe.id, title: recipe.title, ok: false });
            continue;
        }

        const { error: upsertErr } = await supabase
            .from('recipe_embeddings')
            .upsert(
                { recipe_id: recipe.id, embedding, embedded_at: new Date().toISOString() },
                { onConflict: 'recipe_id' }
            );
        results.push({ id: recipe.id, title: recipe.title, ok: !upsertErr });
    }

    return NextResponse.json({ embedded: results.filter((r) => r.ok).length, results });
}
