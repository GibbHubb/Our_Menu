-- 021 — OM42: adding a dish adds the ingredients you CHOSE
--
-- The recipe page already had a per-recipe list with a scale slider and pantry
-- badges; OM40 then grew a second "Add to list" control beside it. Max,
-- 2026-08-25: "see how we have done it twice". The two become one — you pick on
-- the recipe page, and what you picked is what lands on the shopping list.
--
-- Excluded ingredients are stored as canonical keys rather than raw lines so
-- they survive a re-extraction that rewords the ingredient.
ALTER TABLE meal_basket ADD COLUMN IF NOT EXISTS excluded TEXT[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN meal_basket.excluded IS
  'OM42 canonical ingredient keys the user unticked when adding this dish (usually pantry staples)';
