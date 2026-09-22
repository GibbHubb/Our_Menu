-- ═══════════════════════════════════════════════════════════════════════
-- 025 — OM56: close the RLS gaps and pin the unqualified functions
-- ═══════════════════════════════════════════════════════════════════════
--
-- Re-measured 2026-09-22, after OM50 dropped meal_basket/shopping_extras
-- .checked/pantry_items.needed earlier the same day. `scripts/rls_audit.sql`
-- against the live `public` schema shows the gap is bigger than the plan's
-- original single-table finding:
--
--   rowsecurity = false : recipe_embeddings, recipes_backup_om40,
--                         recipes_orphan_backup_2026_08_26
--   unpinned search_path (app-owned, non-extension functions):
--                         match_recipes, claim_orphan_data, server_now,
--                         stamp_tick_updated_at
--
-- Part A closes the table the plan was written for: recipe_embeddings.
-- Parented on `recipes` per 001:10's FK, the same shape 010:94 already uses
-- — no new column, no backfill, no trigger. The policy subquery against
-- `recipes` is itself evaluated under that table's own RLS (including the
-- "recipes anon read public" policy), so an anon caller gets embeddings for
-- public recipes only, exactly mirroring what they can already read.
--
-- Part B is new since the plan was written: `recipes_backup_om40` and
-- `recipes_orphan_backup_2026_08_26` are debris tables (96 and 82 rows) with
-- no RLS AND full anon/authenticated CRUD grants inherited from Postgres'
-- default — worse than the table the plan was scoped around, because it is
-- read+write, not just read. No app code references either name (grepped).
-- Closing them here rather than filing a new ticket: same class of problem,
-- same migration, zero behaviour change for the app (nothing touches them),
-- and the plan's own acceptance criterion #5 ("0 tables with rowsecurity =
-- false") is written against `public` as a whole, not against one named
-- table. Fix is RLS-on + an explicit deny-all policy (not just a REVOKE,
-- which would leave rowsecurity=false and still fail the audit) — REVOKE is
-- included anyway, belt-and-suspenders, since it costs nothing.
--
-- Part C pins the four SECURITY INVOKER functions that reference public
-- objects unqualified. None of the four is SECURITY DEFINER, so this is
-- defence-in-depth (an invoker function can't already escalate privilege via
-- a hijacked search_path) rather than a live hole, but it is what criterion
-- #4 measures and the role's search_path is `public,graphql_public,cortana`
-- — see plan §8. Uses ALTER FUNCTION ... SET, not CREATE OR REPLACE: it sets
-- the same proconfig without needing to reproduce each function's current
-- body, so there is no risk of a copy/paste drift from what is actually
-- live. pgvector's own functions (vector_*, halfvec_*, ...) are deliberately
-- excluded — they belong to the `vector` extension, not this app, and
-- `scripts/rls_audit.sql` filters them out by extension membership.
--
-- Idempotent throughout: DROP POLICY IF EXISTS + CREATE, to_regclass guards,
-- ALTER FUNCTION SET is itself idempotent.
--
-- Reversal:
--   ALTER TABLE recipe_embeddings DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS recipe_embeddings_select ON recipe_embeddings;
--   DROP POLICY IF EXISTS recipe_embeddings_insert ON recipe_embeddings;
--   DROP POLICY IF EXISTS recipe_embeddings_update ON recipe_embeddings;
--   DROP POLICY IF EXISTS recipe_embeddings_delete ON recipe_embeddings;
--   ALTER TABLE recipes_backup_om40 DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE recipes_orphan_backup_2026_08_26 DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS deny_all ON recipes_backup_om40;
--   DROP POLICY IF EXISTS deny_all ON recipes_orphan_backup_2026_08_26;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON recipes_backup_om40,
--     recipes_orphan_backup_2026_08_26 TO anon, authenticated;
--   ALTER FUNCTION match_recipes(vector, integer) RESET search_path;
--   ALTER FUNCTION claim_orphan_data() RESET search_path;
--   ALTER FUNCTION server_now() RESET search_path;
--   ALTER FUNCTION stamp_tick_updated_at() RESET search_path;
--
-- Not touched: the existing 48 policies (audited, not rewritten — plan §4),
-- anything in cortana/poly/auth.*, meal_basket/pantry_items.needed/
-- shopping_extras.checked (that is OM50, already applied and out of scope
-- here — plan §4).

-- ── Part A — recipe_embeddings ──────────────────────────────────────────

ALTER TABLE recipe_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_embeddings_select ON recipe_embeddings;
DROP POLICY IF EXISTS recipe_embeddings_insert ON recipe_embeddings;
DROP POLICY IF EXISTS recipe_embeddings_update ON recipe_embeddings;
DROP POLICY IF EXISTS recipe_embeddings_delete ON recipe_embeddings;

CREATE POLICY recipe_embeddings_select ON recipe_embeddings
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_embeddings.recipe_id)
  );

CREATE POLICY recipe_embeddings_insert ON recipe_embeddings
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_embeddings.recipe_id
        AND (r.household_id IS NULL OR is_household_member(r.household_id))
    )
  );

CREATE POLICY recipe_embeddings_update ON recipe_embeddings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_embeddings.recipe_id
        AND (r.household_id IS NULL OR is_household_member(r.household_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_embeddings.recipe_id
        AND (r.household_id IS NULL OR is_household_member(r.household_id))
    )
  );

CREATE POLICY recipe_embeddings_delete ON recipe_embeddings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_embeddings.recipe_id
        AND (r.household_id IS NULL OR is_household_member(r.household_id))
    )
  );

-- ── Part B — debris tables found during re-measurement (not in the plan's
--             original scope; see header) ─────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipes_backup_om40', 'recipes_orphan_backup_2026_08_26'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_all ON %I', t);
    EXECUTE format('CREATE POLICY deny_all ON %I FOR ALL USING (false) WITH CHECK (false)', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ── Part C — pin unqualified search_path on app-owned functions ────────

ALTER FUNCTION match_recipes(vector, integer) SET search_path = public;
ALTER FUNCTION claim_orphan_data() SET search_path = public;
ALTER FUNCTION server_now() SET search_path = public;
ALTER FUNCTION stamp_tick_updated_at() SET search_path = public;
