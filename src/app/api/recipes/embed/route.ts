// IMPORTANT: Before using this endpoint, run supabase/migrations/001_recipe_embeddings.sql
// in the Supabase SQL editor to create the recipe_embeddings table and match_recipes function.
// Also ensure OPENAI_API_KEY is set in .env.local.

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(_req: NextRequest) {
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
