-- Run this in the Supabase SQL editor
-- Note: recipes.id is a uuid (confirmed from types.ts)

-- Enable pgvector extension (may already be enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Recipe embeddings table
CREATE TABLE IF NOT EXISTS recipe_embeddings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id   uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    embedding   vector(1536),
    embedded_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_embeddings_recipe_id ON recipe_embeddings(recipe_id);

-- Semantic search function (cosine similarity, top K results)
CREATE OR REPLACE FUNCTION match_recipes(
    query_embedding vector(1536),
    match_count     int DEFAULT 5
)
RETURNS TABLE (
    recipe_id   uuid,
    similarity  float
)
LANGUAGE sql STABLE AS $$
    SELECT
        recipe_id,
        1 - (embedding <=> query_embedding) AS similarity
    FROM recipe_embeddings
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;
