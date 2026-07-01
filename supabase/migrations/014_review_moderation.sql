-- OM32 — Review moderation + owner reply (stacks on 012_recipe_reviews.sql).
--
-- Soft-hide (reversible) instead of only hard-delete, plus exactly one owner
-- reply per review (the single owner_reply column enforces "one reply"
-- structurally — no replies table). Authority = "you own the recipe", reusing
-- the EXISTS-on-recipes.user_id idiom from the OM29 "reviews owner delete"
-- policy. Idempotent.

ALTER TABLE recipe_reviews
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_reply TEXT
    CHECK (owner_reply IS NULL OR length(owner_reply) <= 2000),
  ADD COLUMN IF NOT EXISTS owner_replied_at TIMESTAMPTZ;

-- The recipe owner can UPDATE (hide/unhide + reply) reviews on a recipe they
-- own. WITH CHECK keeps the row under an owned recipe so the owner can't
-- re-parent a review to someone else's recipe. Anon cannot UPDATE.
DROP POLICY IF EXISTS "reviews owner update" ON recipe_reviews;
CREATE POLICY "reviews owner update"
  ON recipe_reviews FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.user_id = auth.uid()
    )
  );
