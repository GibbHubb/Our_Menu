-- OM11: Per-serving nutrition estimates (kcal / protein / carbs / fat) on recipes,
-- generated on-demand via Claude Haiku and cached on the row. `ingredients_hash`
-- lets the API skip a re-call when the ingredient list hasn't changed.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS kcal_per_serving       NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_g              NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_g                NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_g                  NUMERIC,
  ADD COLUMN IF NOT EXISTS ingredients_hash       TEXT,
  ADD COLUMN IF NOT EXISTS nutrition_generated_at TIMESTAMPTZ;
