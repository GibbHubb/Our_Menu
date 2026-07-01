-- OM30: Diet tags on recipes (vegetarian / vegan / gluten-free / dairy-free).
-- Owner-set only — no inference. Empty array means "untagged" (NOT asserted
-- safe for any diet), so a diet filter excludes empty-diet recipes.
-- Mirrors 009_recipe_seasons.sql (TEXT[] + GIN index, idempotent).

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS diet TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_recipes_diets ON recipes USING GIN (diet);
