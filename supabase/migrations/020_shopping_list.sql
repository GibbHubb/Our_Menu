-- ═══════════════════════════════════════════════════════════════════════
-- 020 — OM40: the shopping list, the pantry "we need this" flag, and the
--       base serving count that makes scaling possible
-- ═══════════════════════════════════════════════════════════════════════
--
-- Max, 2026-08-25: "you select a dish and how many servings and it will just
-- tell you how much of each you will need... but for that our pantry would
-- need to be up to date."
--
-- Three new tables, two new columns:
--
--   recipes.servings        base yield, so 6 people against a serves-4 recipe
--                           is 1.5x. NULL means "unknown" and scales x1 — it
--                           never guesses, because a silent x1.5 on the wrong
--                           base is worse than no number.
--   recipes.diet_auto       the diet tags on this row were inferred from the
--                           ingredients, not set by a human. The UI says so.
--   pantry_items.needed     "we're low on this" -> appears under Staples.
--   meal_basket             the dishes currently on the list, with servings.
--   shopping_extras         hand-typed items ("bin bags").
--   shopping_ticks          tick state for the COMPUTED ingredient lines,
--                           keyed by line rather than row id so it survives a
--                           servings change or a dish being removed.
--
-- Every new table is household-scoped with the same policy shape as 016,
-- except that WITH CHECK is strict: there is no legacy NULL-household data to
-- adopt here, so the "household_id IS NULL OR ..." branch that 016 needs for
-- migration would only be a hole.
--
-- Idempotent: safe to re-run.

-- ── Part A — columns ───────────────────────────────────────────────────

ALTER TABLE recipes      ADD COLUMN IF NOT EXISTS servings  INT;
ALTER TABLE recipes      ADD COLUMN IF NOT EXISTS diet_auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS needed    BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN recipes.servings  IS 'OM40 base yield from the source page recipeYield; NULL = unknown, scales x1';
COMMENT ON COLUMN recipes.diet_auto IS 'OM40 diet[] was inferred from ingredients, not set by a human';
COMMENT ON COLUMN pantry_items.needed IS 'OM40 we are low on this — show it under Staples on the shopping list';

-- ── Part B — tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meal_basket (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  recipe_id    UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  servings     INT  NOT NULL DEFAULT 4 CHECK (servings > 0 AND servings <= 50),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per dish per household: adding the same dish twice adjusts the
-- servings instead of stacking two entries the user then has to reconcile.
CREATE UNIQUE INDEX IF NOT EXISTS meal_basket_household_recipe
  ON meal_basket (household_id, recipe_id);

CREATE TABLE IF NOT EXISTS shopping_extras (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (length(trim(label)) > 0),
  checked      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_ticks (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  line_key     TEXT NOT NULL,
  checked      BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, line_key)
);

-- ── Part C — household stamping ────────────────────────────────────────
-- Same BEFORE INSERT trigger the 016 tables use, so client inserts never
-- have to know about households.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['meal_basket', 'shopping_extras'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_household ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_stamp_household BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION stamp_household_id()', t);
  END LOOP;
END $$;

-- shopping_ticks has a composite PK including household_id, so it cannot use
-- a nullable stamped column. Default it instead.
ALTER TABLE shopping_ticks
  ALTER COLUMN household_id SET DEFAULT get_active_household();

-- ── Part D — RLS ───────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['meal_basket', 'shopping_extras', 'shopping_ticks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (is_household_member(household_id))',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (is_household_member(household_id))',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
         USING (is_household_member(household_id)) WITH CHECK (is_household_member(household_id))',
      t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (is_household_member(household_id))',
      t || '_delete', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON meal_basket, shopping_extras, shopping_ticks TO authenticated;
