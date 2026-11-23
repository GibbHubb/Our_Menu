// Batch-embeds the caller's recipes into recipe_embeddings (migration 001, RLS from 025).
// OM68: Gemini embeddings via src/lib/embeddings.ts (GEMINI_API_KEY), 1536 dims to fit vector(1536).
//
// OM72 — resumable instead of all-at-once. Each call used to re-embed every recipe one after another,
// which risks the Vercel function limit and the Gemini free-tier 429 as the library grows. Now:
//   POST /api/recipes/embed                    embed recipes with no vector yet
//   POST /api/recipes/embed?force=1            also re-embed existing vectors; the reply carries `since`
//   POST /api/recipes/embed?force=1&since=ISO  continue a forced run (vectors written after `since` are done)
// At most EMBED_CAP_PER_CALL per call, EMBED_CONCURRENCY at a time, stopping early on a 429 or when the
// time budget runs out. Reply: { embedded, skipped, failed, remaining } (+ `since` when forced), where
// `remaining` counts recipes still to do after this call (failures included, so pressing again retries
// them). The admin Sync (`/?admin=1`) presses again until `remaining` is 0.

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';
import { EmbeddingsHttpError, embedText, recipeEmbeddingText } from '@/lib/embeddings';
import { aiFeatureOffError } from '@/lib/aiFeatures';

export const maxDuration = 60;

/** Recipes embedded per call at most. ~1 s each at 4 at a time keeps a call around 5-10 s. */
const EMBED_CAP_PER_CALL = 20;
/** Embedding calls in flight at once: well under the free-tier per-minute limit. */
const EMBED_CONCURRENCY = 4;
/** Stop starting new batches after this long, leaving room under maxDuration. */
const TIME_BUDGET_MS = 40_000;

type RecipeRow = { id: string; title: string | null; ingredients: string | string[] | null; instructions: string | null };

export async function POST(req: NextRequest) {
    // OM55 — this used the ADMIN client with no auth at all, and returned {id, title} for every
    // recipe in every household to any anonymous caller (inert only because no LLM key exists
    // yet). Now: signed-in only, and the caller's own RLS-scoped client, so it embeds and
    // reports exactly the recipes that caller can see.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    // Embeddings exist only to serve semantic search, so they follow its switch (OM72).
    const off = aiFeatureOffError('search', 'Semantic search is');
    if (off) return NextResponse.json({ error: off }, { status: 503 });

    const force = req.nextUrl.searchParams.get('force') === '1';
    const sinceParam = req.nextUrl.searchParams.get('since');
    const since = force
        ? (sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam).toISOString() : new Date().toISOString())
        : null;

    const supabase = createRequestClient(req);
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, ingredients, instructions');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: existing, error: existingErr } = await supabase
        .from('recipe_embeddings')
        .select('recipe_id, embedded_at');
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    // A recipe is done when it has a vector (and, on a forced run, one written at or after `since`).
    const done = new Set(
        (existing ?? [])
            .filter((e: { embedded_at: string | null }) =>
                !since || (e.embedded_at !== null && Date.parse(e.embedded_at) >= Date.parse(since)))
            .map((e: { recipe_id: string }) => e.recipe_id),
    );
    const all = (recipes ?? []) as RecipeRow[];
    const todo = all.filter((r) => !done.has(r.id));
    const skipped = all.length - todo.length;

    let embedded = 0;
    let failed = 0;
    let stopped = false;
    const started = Date.now();
    const batch = todo.slice(0, EMBED_CAP_PER_CALL);

    for (let i = 0; i < batch.length && !stopped; i += EMBED_CONCURRENCY) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const group = batch.slice(i, i + EMBED_CONCURRENCY);
        const outcomes = await Promise.all(group.map(async (recipe) => {
            let embedding: number[];
            try {
                embedding = await embedText(recipeEmbeddingText(recipe), 'RETRIEVAL_DOCUMENT');
            } catch (e) {
                console.error(`recipes/embed failed for ${recipe.id}:`, e);
                if (e instanceof EmbeddingsHttpError && e.status === 429) stopped = true;
                return false;
            }
            const { error: upsertErr } = await supabase
                .from('recipe_embeddings')
                .upsert(
                    { recipe_id: recipe.id, embedding, embedded_at: new Date().toISOString() },
                    { onConflict: 'recipe_id' },
                );
            if (upsertErr) console.error(`recipes/embed upsert failed for ${recipe.id}:`, upsertErr.message);
            return !upsertErr;
        }));
        for (const ok of outcomes) {
            if (ok) embedded++;
            else failed++;
        }
    }

    const remaining = todo.length - embedded;
    return NextResponse.json({
        embedded,
        skipped,
        failed,
        remaining,
        ...(since ? { since } : {}),
        ...(stopped ? { busy: true } : {}),
    });
}
