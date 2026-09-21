// IMPORTANT: Before using this endpoint, run supabase/migrations/001_recipe_embeddings.sql
// in the Supabase SQL editor to create the recipe_embeddings table and match_recipes function.
// Also ensure OPENAI_API_KEY is set in .env.local.

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
    // OM55 — this used the ADMIN client with no auth at all, and returned {id, title} for every
    // recipe in every household to any anonymous caller (inert only because no LLM key exists
    // yet). Now: signed-in only, and the caller's own RLS-scoped client, so it embeds and
    // reports exactly the recipes that caller can see.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const supabase = createRequestClient(req);
    // Fetch all recipes
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, ingredients, instructions');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = [];
    for (const recipe of recipes ?? []) {
        const text = [
            recipe.title,
            Array.isArray(recipe.ingredients)
                ? recipe.ingredients.join(', ')
                : recipe.ingredients,
            recipe.instructions,
        ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 8000); // cap at 8K chars

        const embRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        const embedding = embRes.data[0].embedding;

        const { error: upsertErr } = await supabase
            .from('recipe_embeddings')
            .upsert(
                { recipe_id: recipe.id, embedding, embedded_at: new Date().toISOString() },
                { onConflict: 'recipe_id' }
            );
        results.push({ id: recipe.id, title: recipe.title, ok: !upsertErr });
    }

    return NextResponse.json({ embedded: results.length, results });
}
