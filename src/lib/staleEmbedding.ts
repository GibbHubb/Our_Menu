// OM75 — an edited recipe no longer keeps its old search vector.
//
// `recipes/embed` (the admin Sync) only embeds recipes that have NO row in `recipe_embeddings`, so a
// recipe whose title, ingredients or method changed kept the vector of its old text until someone ran a
// forced Sync. Every save path that can change that text now deletes the recipe's vector after the
// recipe update succeeds. Semantic search then does not find that recipe until an admin next presses
// Sync, which re-embeds it; nothing ever ranks on stale text.
//
// Deleting beats re-embedding on save: no Gemini call (or quota) on the save path and no admin check
// in the browser. The delete runs as the signed-in user under RLS. `recipe_embeddings_delete`
// (migration 025) allows it when the recipe's `household_id IS NULL OR is_household_member(...)`.
// The current `recipes_update` policy (migration 016, which replaced 010's `user_id` version) is
// USING (household_id IS NULL OR is_household_member(household_id)) WITH CHECK
// (is_household_member(household_id)): a successful update leaves the recipe in one of the caller's
// households, so the delete policy admits the same caller. If RLS still filters the delete, Postgres
// reports no error and zero rows; `dropStaleEmbedding` logs that as a warning so it is visible.

import { recipeEmbeddingText } from "@/lib/embeddings";

type EmbeddedFields = Parameters<typeof recipeEmbeddingText>[0];

/** Did a save change the text the recipe's embedding was made from (title, ingredients, method)? */
export function embeddingTextChanged(before: EmbeddedFields | null | undefined, after: EmbeddedFields): boolean {
    if (!before) return true;
    return recipeEmbeddingText(before) !== recipeEmbeddingText(after);
}

/** The slice of a Supabase client this needs (structural, so a test can pass a fake). */
export type EmbeddingDeleteClient = {
    from(table: "recipe_embeddings"): {
        delete(): {
            eq(column: "recipe_id", value: string): {
                select(columns: "recipe_id"): PromiseLike<{
                    data: { recipe_id: string }[] | null;
                    error: { message: string } | null;
                }>;
            };
        };
    };
};

/** `deleted`: a vector was removed. `none`: no row came back (no vector yet, or RLS hid it). */
export type DropResult = "deleted" | "none" | "failed";

/**
 * Delete the recipe's vector so the next Sync re-embeds it. Best effort: the recipe itself is already
 * saved, so a failure is logged and swallowed (the worst case is the old behaviour, a stale vector).
 */
export async function dropStaleEmbedding(client: EmbeddingDeleteClient, recipeId: string): Promise<DropResult> {
    try {
        const { data, error } = await client
            .from("recipe_embeddings")
            .delete()
            .eq("recipe_id", recipeId)
            .select("recipe_id");
        if (error) {
            console.error("OM75: could not drop the stale embedding:", error.message);
            return "failed";
        }
        if (!data || data.length === 0) {
            // Fine when the recipe was never embedded; a silent RLS filter looks the same, so say so.
            console.warn(`OM75: no embedding row deleted for recipe ${recipeId} (none yet, or RLS filtered it).`);
            return "none";
        }
        return "deleted";
    } catch (e) {
        console.error("OM75: could not drop the stale embedding:", e);
        return "failed";
    }
}

/**
 * Save a recipe, then drop its vector if the embedded text changed versus what is PERSISTED.
 *
 * `persisted.current` is the last version known to be in the database. It moves only after `save`
 * resolves, so a failed save (which the recipe page shows optimistically, then lets the user retry)
 * is still diffed against the stored text on the retry. `save` must throw on failure; the error
 * propagates and nothing is dropped. Returns what happened to the vector (`kept` when unchanged).
 */
export async function saveThenDropStale<T extends EmbeddedFields & { id: string }>(
    persisted: { current: EmbeddedFields | null | undefined },
    updated: T,
    save: () => Promise<void>,
    drop: (recipeId: string) => Promise<DropResult>,
): Promise<DropResult | "kept"> {
    await save();
    const changed = embeddingTextChanged(persisted.current, updated);
    persisted.current = updated;
    return changed ? drop(updated.id) : "kept";
}
