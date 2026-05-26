-- OM14 Phase A: Real authentication + per-user scoping.
--
-- Strategy:
--   1. Add nullable `user_id` (FK → auth.users) to every user-data table.
--   2. Replace the "everyone can do everything" RLS policies from the
--      original schema with auth-aware policies. Anonymous data (rows where
--      user_id IS NULL) stays readable by anyone — this preserves the
--      existing single-tenant UX until someone signs in.
--   3. Provide `claim_orphan_data()` — an authenticated-only function the
--      app calls on first login to assign every NULL-owned row to the
--      logged-in user. Runs SECURITY INVOKER so it goes through RLS.
--
-- Idempotent: every ALTER uses IF EXISTS so the file works whether 008/009
-- have been applied yet or not. Policies drop-and-recreate cleanly.

-- ── recipes ──────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS recipes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);

-- Drop the legacy "Enable * for all users" policies so the new auth-aware
-- ones take effect.
DROP POLICY IF EXISTS "Enable read access for all users"   ON recipes;
DROP POLICY IF EXISTS "Enable insert access for all users" ON recipes;
DROP POLICY IF EXISTS "Enable delete access for all users" ON recipes;
DROP POLICY IF EXISTS "Enable update access for all users" ON recipes;

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_select ON recipes FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY recipes_insert ON recipes FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- UPDATE allows two cases: editing a row you already own, OR claiming an
-- unowned row by setting user_id to your uid.
CREATE POLICY recipes_update ON recipes FOR UPDATE
  USING      (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY recipes_delete ON recipes FOR DELETE
  USING (user_id = auth.uid());

-- ── cook_log ─────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS cook_log
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cook_log_user_id ON cook_log(user_id);
ALTER TABLE cook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cook_log_select ON cook_log;
DROP POLICY IF EXISTS cook_log_insert ON cook_log;
DROP POLICY IF EXISTS cook_log_update ON cook_log;
DROP POLICY IF EXISTS cook_log_delete ON cook_log;

CREATE POLICY cook_log_select ON cook_log FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY cook_log_insert ON cook_log FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY cook_log_update ON cook_log FOR UPDATE
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());
CREATE POLICY cook_log_delete ON cook_log FOR DELETE
  USING (user_id = auth.uid());

-- ── recipe_collections ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS recipe_collections
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_collections_user_id ON recipe_collections(user_id);
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_collections_select ON recipe_collections;
DROP POLICY IF EXISTS recipe_collections_insert ON recipe_collections;
DROP POLICY IF EXISTS recipe_collections_update ON recipe_collections;
DROP POLICY IF EXISTS recipe_collections_delete ON recipe_collections;

-- The original `name UNIQUE` constraint stops two users from each having
-- "Weeknight Quick" — relax to UNIQUE(user_id, name).
ALTER TABLE recipe_collections DROP CONSTRAINT IF EXISTS recipe_collections_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_collections_user_name
  ON recipe_collections(user_id, name);

CREATE POLICY recipe_collections_select ON recipe_collections FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY recipe_collections_insert ON recipe_collections FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY recipe_collections_update ON recipe_collections FOR UPDATE
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());
CREATE POLICY recipe_collections_delete ON recipe_collections FOR DELETE
  USING (user_id = auth.uid());

-- recipe_collection_items inherits scope from its parent collection.
ALTER TABLE IF EXISTS recipe_collection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rci_all ON recipe_collection_items;
CREATE POLICY rci_all ON recipe_collection_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipe_collections c
      WHERE c.id = recipe_collection_items.collection_id
        AND (c.user_id = auth.uid() OR c.user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipe_collections c
      WHERE c.id = recipe_collection_items.collection_id
        AND (c.user_id = auth.uid() OR c.user_id IS NULL)
    )
  );

-- ── meal_plans ────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS meal_plans
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meal_plans_select ON meal_plans;
DROP POLICY IF EXISTS meal_plans_insert ON meal_plans;
DROP POLICY IF EXISTS meal_plans_update ON meal_plans;
DROP POLICY IF EXISTS meal_plans_delete ON meal_plans;

CREATE POLICY meal_plans_select ON meal_plans FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY meal_plans_insert ON meal_plans FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY meal_plans_update ON meal_plans FOR UPDATE
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());
CREATE POLICY meal_plans_delete ON meal_plans FOR DELETE
  USING (user_id = auth.uid());

-- ── pantry_items (OM12) ───────────────────────────────────────────────────
-- The IF EXISTS guard means this section no-ops cleanly if 008 hasn't been
-- applied yet — the UNIQUE-constraint reshape below also tolerates absence.
ALTER TABLE IF EXISTS pantry_items
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pantry_items') THEN
    -- Two users can each have "onion" — relax the global UNIQUE on canonical_key.
    ALTER TABLE pantry_items DROP CONSTRAINT IF EXISTS pantry_items_canonical_key_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pantry_user_key
      ON pantry_items(user_id, canonical_key);

    CREATE INDEX IF NOT EXISTS idx_pantry_user_id ON pantry_items(user_id);
    EXECUTE 'ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS pantry_items_select ON pantry_items';
    EXECUTE 'DROP POLICY IF EXISTS pantry_items_insert ON pantry_items';
    EXECUTE 'DROP POLICY IF EXISTS pantry_items_update ON pantry_items';
    EXECUTE 'DROP POLICY IF EXISTS pantry_items_delete ON pantry_items';

    EXECUTE 'CREATE POLICY pantry_items_select ON pantry_items FOR SELECT
      USING (user_id = auth.uid() OR user_id IS NULL)';
    EXECUTE 'CREATE POLICY pantry_items_insert ON pantry_items FOR INSERT
      WITH CHECK (user_id = auth.uid() OR user_id IS NULL)';
    EXECUTE 'CREATE POLICY pantry_items_update ON pantry_items FOR UPDATE
      USING (user_id = auth.uid() OR user_id IS NULL)
      WITH CHECK (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY pantry_items_delete ON pantry_items FOR DELETE
      USING (user_id = auth.uid())';
  END IF;
END $$;

-- ── claim_orphan_data() ──────────────────────────────────────────────────
-- Called once on first login to assign every anonymous row to the
-- newly-authenticated user. Runs as the caller (SECURITY INVOKER) so the
-- update goes through RLS — which is exactly what allows the claim:
-- user_id IS NULL passes the USING clause, user_id = auth.uid() passes
-- the WITH CHECK clause.
CREATE OR REPLACE FUNCTION claim_orphan_data()
RETURNS TABLE (table_name TEXT, claimed_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  uid UUID := auth.uid();
  cnt BIGINT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'claim_orphan_data: not authenticated';
  END IF;

  UPDATE recipes SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  table_name := 'recipes'; claimed_count := cnt; RETURN NEXT;

  UPDATE cook_log SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  table_name := 'cook_log'; claimed_count := cnt; RETURN NEXT;

  UPDATE recipe_collections SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  table_name := 'recipe_collections'; claimed_count := cnt; RETURN NEXT;

  UPDATE meal_plans SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  table_name := 'meal_plans'; claimed_count := cnt; RETURN NEXT;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pantry_items') THEN
    UPDATE pantry_items SET user_id = uid WHERE user_id IS NULL;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    table_name := 'pantry_items'; claimed_count := cnt; RETURN NEXT;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION claim_orphan_data() TO authenticated;
