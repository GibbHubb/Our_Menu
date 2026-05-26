-- OM29 — Recipe reviews from outside guests (public guestbook).
--
-- Plan §8 → recommended: explicit `is_public` share flag on recipes
-- (NOT every recipe public by URL — owners opt-in per recipe).
-- Anon inserts allowed on recipe_reviews ONLY when the target recipe
-- is is_public = TRUE.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;


CREATE TABLE IF NOT EXISTS recipe_reviews (
    id BIGSERIAL PRIMARY KEY,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    guest_name TEXT,                              -- nullable for fully-anon entries
    comment TEXT NOT NULL CHECK (length(comment) > 0 AND length(comment) <= 2000),
    rating INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recipe_reviews_recipe_id_idx ON recipe_reviews(recipe_id);


ALTER TABLE recipe_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) can READ reviews of a recipe that is is_public.
DROP POLICY IF EXISTS "reviews public read" ON recipe_reviews;
CREATE POLICY "reviews public read"
  ON recipe_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.is_public = TRUE
    )
  );

-- Anyone (incl. anon) can INSERT a review against a public recipe.
DROP POLICY IF EXISTS "reviews public insert" ON recipe_reviews;
CREATE POLICY "reviews public insert"
  ON recipe_reviews FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.is_public = TRUE
    )
  );

-- The recipe owner can DELETE moderation. (No anon delete.)
DROP POLICY IF EXISTS "reviews owner delete" ON recipe_reviews;
CREATE POLICY "reviews owner delete"
  ON recipe_reviews FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.user_id = auth.uid()
    )
  );


-- Allow anon SELECT on public recipes only (so the public share page
-- can fetch the recipe itself; owner SELECT is unchanged).
DROP POLICY IF EXISTS "recipes anon read public" ON recipes;
CREATE POLICY "recipes anon read public"
  ON recipes FOR SELECT
  USING (is_public = TRUE);
