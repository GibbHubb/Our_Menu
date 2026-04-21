-- OM7: Recipe cook history
CREATE TABLE IF NOT EXISTS cook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  cooked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cook_log_recipe_id ON cook_log(recipe_id);
CREATE INDEX IF NOT EXISTS idx_cook_log_cooked_at ON cook_log(cooked_at DESC);
