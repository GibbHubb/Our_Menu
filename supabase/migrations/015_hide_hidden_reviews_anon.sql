-- OM32-fu1 — Harden hidden-review visibility at the DB level.
--
-- OM32 (014_review_moderation.sql) added is_hidden + client-side filtering
-- on the public /r/[id] page (visibleReviews = isOwner ? reviews : reviews
-- .filter(!is_hidden)). But fetchReviews() (src/lib/reviews.ts) does
-- `select("*")` through the anon-key client with NO is_hidden predicate,
-- relying on RLS alone to gate rows — and the only SELECT policy on
-- recipe_reviews, "reviews public read" (012_recipe_reviews.sql), only
-- checks recipes.is_public, never is_hidden. A determined anon calling the
-- Supabase REST API directly (bypassing the client-side filter) can read
-- hidden reviews. Fix at the DB so hidden rows never leave Postgres.
--
-- "reviews public read" had no `TO` clause (applies to every role,
-- including authenticated) and was ALSO the only path the recipe owner had
-- for reading their own reviews — there is no separate owner-select policy.
-- So we can't just bolt `AND is_hidden = FALSE` onto it; that would hide
-- hidden reviews from the owner too, breaking moderation. Instead:
--   1. Re-create "reviews public read" with the is_hidden guard (still no
--      TO clause — anon AND non-owner authenticated users both get the
--      guard; hidden reviews are never visible to anyone but the owner).
--   2. Add a new "reviews owner select" policy (same EXISTS-on-
--      recipes.user_id idiom as "reviews owner delete" / "reviews owner
--      update") granting the recipe owner unrestricted SELECT, including
--      hidden rows. RLS policies are OR'd, so the owner's visibility is
--      restored via this second policy — unaffected in practice, since
--      today the owner only ever reached rows through the same query path
--      as everyone else.
-- Idempotent.

DROP POLICY IF EXISTS "reviews public read" ON recipe_reviews;
CREATE POLICY "reviews public read"
  ON recipe_reviews FOR SELECT
  USING (
    is_hidden = FALSE
    AND EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.is_public = TRUE
    )
  );

-- The recipe owner can SELECT every review (incl. hidden) on a recipe they
-- own. Additive/permissive alongside "reviews public read" above, so the
-- owner's moderation view (isOwner branch in /r/[id]) keeps working.
DROP POLICY IF EXISTS "reviews owner select" ON recipe_reviews;
CREATE POLICY "reviews owner select"
  ON recipe_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
       WHERE r.id = recipe_reviews.recipe_id AND r.user_id = auth.uid()
    )
  );
