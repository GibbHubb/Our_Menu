/**
 * OM68 — recipe embeddings on the Gemini free tier.
 *
 * `recipes/embed` and `recipes/search` used OpenAI's `text-embedding-3-small`, which needs a paid
 * key this project never sets (free tier only: Gemini). This is the Gemini replacement.
 *
 * `gemini-embedding-001` is asked for 1536 dimensions so it fits the existing
 * `recipe_embeddings.embedding vector(1536)` column and `match_recipes(vector(1536), int)` with no
 * migration. 1536 is one of the model's recommended reduced sizes; reduced vectors are not
 * unit-length, but `match_recipes` ranks by cosine distance, which ignores length.
 *
 * Native REST endpoint rather than the OpenAI-compatible one in `llm.ts`, because the native
 * one documents `outputDimensionality` and `taskType` (documents and queries embed differently).
 */

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-001";

/** Must match `recipe_embeddings.embedding vector(1536)` (migration 001). */
export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export class EmbeddingsNotConfiguredError extends Error {
    constructor() {
        super("Semantic search is not configured (GEMINI_API_KEY missing)");
        this.name = "EmbeddingsNotConfiguredError";
    }
}

/** OM72 — a non-2xx from Gemini, with its status so the embed route can stop on a 429. */
export class EmbeddingsHttpError extends Error {
    constructor(readonly status: number) {
        super(`Gemini embeddings failed: HTTP ${status}`);
        this.name = "EmbeddingsHttpError";
    }
}

export function embeddingsConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Title, ingredients and method as one string, capped at 8K chars. */
export function recipeEmbeddingText(recipe: {
    title?: string | null;
    ingredients?: string | string[] | null;
    instructions?: string | null;
}): string {
    return [
        recipe.title,
        Array.isArray(recipe.ingredients) ? recipe.ingredients.join(", ") : recipe.ingredients,
        recipe.instructions,
    ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 8000);
}

export async function embedText(text: string, task: EmbeddingTask): Promise<number[]> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new EmbeddingsNotConfiguredError();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType: task,
            outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
    });
    if (!res.ok) {
        throw new EmbeddingsHttpError(res.status);
    }
    const data = (await res.json()) as { embedding?: { values?: unknown } };
    const values = data.embedding?.values;
    if (
        !Array.isArray(values) ||
        values.length !== EMBEDDING_DIMENSIONS ||
        !values.every((v) => typeof v === "number")
    ) {
        throw new Error(
            `Gemini embeddings returned ${Array.isArray(values) ? values.length : "no"} values, expected ${EMBEDDING_DIMENSIONS}`,
        );
    }
    return values as number[];
}
