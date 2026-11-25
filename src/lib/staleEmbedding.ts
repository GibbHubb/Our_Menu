// OM75 — an edited recipe no longer keeps its old search vector.
//
// `recipes/embed` (the admin Sync) only embeds recipes that have NO row in `recipe_embeddings`, so a
// recipe whose title, ingredients or method changed kept the vector of its old text until someone ran a
// forced Sync. Every save path that can change that text now deletes the recipe's vector after the
// recipe update succeeds. Semantic search then simply does not find that recipe until the next plain
// Sync re-embeds it; nothing ever ranks on stale text.
//
// Deleting beats re-embedding on save: no Gemini call (or quota) on the save path, no admin check in
// the browser, and the delete runs as the signed-in user under the `recipe_embeddings_delete` RLS
// policy (migration 025), which allows exactly the people who may edit the recipe.

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
        delete(): { eq(column: "recipe_id", value: string): PromiseLike<{ error: { message: string } | null }> };
    };
};

/**
 * Delete the recipe's vector so the next Sync re-embeds it. Best effort: the recipe itself is already
 * saved, so a failure is logged and swallowed (the worst case is the old behaviour, a stale vector).
 * Returns whether the delete went through without an error.
 */
export async function dropStaleEmbedding(client: EmbeddingDeleteClient, recipeId: string): Promise<boolean> {
    try {
        const { error } = await client.from("recipe_embeddings").delete().eq("recipe_id", recipeId);
        if (error) {
            console.error("OM75: could not drop the stale embedding:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error("OM75: could not drop the stale embedding:", e);
        return false;
    }
}
