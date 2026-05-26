-- OM13: Seasonal recipe tags.
-- Empty array means "year-round". Hemisphere lives on a future household table
-- (OM14); for now a constant Northern Hemisphere calendar is assumed in code.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS seasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_recipes_seasons ON recipes USING GIN (seasons);
