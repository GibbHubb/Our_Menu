-- ═══════════════════════════════════════════════════════════════════════
-- 018 — OM38: an anonymous caller may no longer INSERT into scoped tables
-- ═══════════════════════════════════════════════════════════════════════
--
-- 016 Part E gave every scoped table an INSERT policy of
--
--     WITH CHECK (household_id IS NULL OR is_household_member(household_id))
--
-- with the comment "keeps Phase A's IS NULL escape hatch so anonymous and
-- API-route rows stay visible and writable until OM14c". OM14c shipped
-- (6472bf4 — the caller's session is forwarded to the Next API routes), so
-- the API-route half of that hatch is no longer needed, and the anonymous
-- half is a hole: the publishable key ships in the client bundle, so anyone
-- can POST rows with a NULL household_id and they pass the check.
--
-- It is reachable from the UI, not just from curl: a signed-out visitor got
-- the "Load Initial Menu" button (RLS hides all 96 recipes from anon, so the
-- grid looks empty), and the duplicate guard in handleSeedData reads through
-- the same RLS — it would have seeded a second, orphaned copy of the whole
-- initial menu. The client side of that is fixed in the same ticket; this is
-- the half that holds when the client is bypassed.
--
-- The change is only the added `auth.uid() IS NOT NULL`. The IS NULL branch
-- stays for authenticated callers: trg_stamp_household fills household_id
-- from get_active_household() BEFORE the check runs, but that returns NULL
-- for a user who has no household yet, and those inserts must keep working.
--
-- Idempotent: re-running drops and recreates the same policies.
-- Reversal: re-run 016 Part E's INSERT block.
--
-- Not touched:
--   * SELECT / UPDATE / DELETE — unchanged from 016.
--   * households / household_members / household_invites — no INSERT policy
--     at all; they are written only by ensure_household()/accept_invite().
--   * recipe_collection_items — its rci_all check is parented on a
--     recipe_collections row, which now itself needs an authenticated insert.
--   * service_role writes — RLS is bypassed for that role either way.

DO $$
DECLARE
  t      TEXT;
  scoped TEXT[] := ARRAY['recipes', 'cook_log', 'recipe_collections', 'meal_plans', 'pantry_items'];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT
         WITH CHECK (
           auth.uid() IS NOT NULL
           AND (household_id IS NULL OR is_household_member(household_id))
         )',
      t || '_insert', t);
  END LOOP;
END $$;
