// Batch-embeds the caller's recipes into recipe_embeddings (migration 001, RLS from 025).
// OM68: Gemini embeddings via src/lib/embeddings.ts (GEMINI_API_KEY), 1536 dims to fit vector(1536).
//
// OM72 — resumable instead of all-at-once. Each call used to re-embed every recipe one after another,
// which risks the Vercel function limit and the Gemini free-tier 429 as the library grows. Now:
//   POST /api/recipes/embed                    embed recipes with no vector yet
//   POST /api/recipes/embed?force=1&since=ISO  also re-embed vectors written before `since`; pass the SAME
//                                              `since` on every press of one forced run so each press makes
//                                              progress. `force=1` without `since` is refused (400): a fresh
//                                              now() per press would redo the same first batch forever.
//   GET  /api/recipes/embed                    { admin } — may this caller run the sync? (drives the button)
// At most EMBED_CAP_PER_CALL per call, EMBED_CONCURRENCY at a time, stopping early on a 429 or when the
// time budget runs out. Reply: { embedded, skipped, failed, remaining } (+ `since` when forced), where
// `remaining` counts recipes still to do after this call (failures included, so pressing again retries
// them). The admin Sync (`/?admin=1`) presses again until `remaining` is 0.
//
// OM72 review:
// - Admins only (AI_ADMIN_USER_IDS, src/lib/aiFeatures.ts): the Supabase project is shared with other
//   apps' users and `?admin=1` is only a UI switch. Checked after the 401 and before any work.
// - Only recipes the caller may WRITE an embedding for are worked: a public recipe of another household
//   is readable (012 "recipes anon read public") but the embeddings insert/update policy (025) needs
//   household_id NULL or membership, so it would fail, burn a Gemini call on every press and keep
//   `remaining` above 0 forever. Those count as skipped.
// - Both selects page past PostgREST's 1000-row default.

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';
import { EmbeddingsHttpError, embedText, recipeEmbeddingText } from '@/lib/embeddings';
import { aiFeatureOffError, isAiAdmin } from '@/lib/aiFeatures';

export const maxDuration = 60;

/** Recipes embedded per call at most. ~1 s each at 4 at a time keeps a call around 5-10 s. */
const EMBED_CAP_PER_CALL = 20;
/** Embedding calls in flight at once: well under the free-tier per-minute limit. */
const EMBED_CONCURRENCY = 4;
/** Stop starting new batches after this long, leaving room under maxDuration. */
const TIME_BUDGET_MS = 40_000;
/** PostgREST's default max rows per response. */
const PAGE = 1000;
/** A client clock a little ahead of the server's is fine; further ahead than this is refused. */
const SINCE_SKEW_MS = 5 * 60_000;

type RecipeRow = {
    id: string; title: string | null; ingredients: string | string[] | null; instructions: string | null;
    household_id: string | null;
};

type Page<T> = { data: T[] | null; error: { message: string } | null };

/** Every row of a select, a page at a time (`fetchPage(from, to)` is one `.range(from, to)` call). */
async function selectAll<T>(fetchPage: (from: number, to: number) => PromiseLike<Page<T>>): Promise<Page<T>> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await fetchPage(from, from + PAGE - 1);
        if (error) return { data: null, error };
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) return { data: rows, error: null };
    }
}

/** GET: is the caller allowed to run the sync? The admin Sync button only renders when this is true. */
export async function GET(req: NextRequest) {
    const user = await getRequestUser(req);
    return NextResponse.json(
        { admin: isAiAdmin(user?.id) },
        { headers: { 'Cache-Control': 'private, no-store' } },
    );
}

export async function POST(req: NextRequest) {
    // OM55 — this used the ADMIN client with no auth at all, and returned {id, title} for every
    // recipe in every household to any anonymous caller (inert only because no LLM key exists
    // yet). Now: signed-in only, and the caller's own RLS-scoped client, so it embeds and
    // reports exactly the recipes that caller can see.
    const user = await getRequestUser(req);
    if (!user) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    if (!isAiAdmin(user.id)) {
        return NextResponse.json({ error: 'Only an admin can run the embedding sync.' }, { status: 403 });
    }
    // Embeddings exist only to serve semantic search, so they follow its switch (OM72).
    const off = aiFeatureOffError('search', 'Semantic search is');
    if (off) return NextResponse.json({ error: off }, { status: 503 });

    const force = req.nextUrl.searchParams.get('force') === '1';
    const sinceParam = req.nextUrl.searchParams.get('since');
    let since: string | null = null;
    if (force) {
        const t = sinceParam ? Date.parse(sinceParam) : NaN;
        if (Number.isNaN(t)) {
            return NextResponse.json(
                { error: 'force=1 needs since=<ISO time the forced run started>, the same on every press.' },
                { status: 400 },
            );
        }
        if (t > Date.now() + SINCE_SKEW_MS) {
            return NextResponse.json({ error: 'since is in the future.' }, { status: 400 });
        }
        // Never later than now: a vector written by this call must count as done on the next press.
        since = new Date(Math.min(t, Date.now())).toISOString();
    }

    const supabase = createRequestClient(req);
    const { data: recipes, error } = await selectAll<RecipeRow>((from, to) => supabase
        .from('recipes')
        .select('id, title, ingredients, instructions, household_id')
        .order('id')
        .range(from, to));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: existing, error: existingErr } = await selectAll<{ recipe_id: string; embedded_at: string | null }>(
        (from, to) => supabase
            .from('recipe_embeddings')
            .select('recipe_id, embedded_at')
            .order('recipe_id')
            .range(from, to));
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    // The households the caller belongs to: the embeddings write policy (025) allows household_id NULL
    // or a household the caller is a member of, so those are the only recipes worth an embedding call.
    const { data: memberships, error: memberErr } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id);
    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
    const mine = new Set((memberships ?? []).map((m: { household_id: string }) => m.household_id));
    const writable = (r: RecipeRow) => r.household_id === null || mine.has(r.household_id);

    // A recipe is done when it has a vector (and, on a forced run, one written at or after `since`).
    const done = new Set(
        (existing ?? [])
            .filter((e: { embedded_at: string | null }) =>
                !since || (e.embedded_at !== null && Date.parse(e.embedded_at) >= Date.parse(since)))
            .map((e: { recipe_id: string }) => e.recipe_id),
    );
    const all = (recipes ?? []) as RecipeRow[];
    // Skipped = already embedded, or not the caller's to embed (never attempted, never "remaining").
    const todo = all.filter((r) => writable(r) && !done.has(r.id));
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
        ...(stopped ? { busy: true } : {}),
    });
}
