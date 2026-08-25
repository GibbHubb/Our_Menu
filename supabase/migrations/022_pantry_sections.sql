-- 022 — OM42: the pantry is not only food
--
-- Max, 2026-08-25: "have a kitchen and bathroom section with washing powder and
-- toothpaste etc". He had already added Toilet Paper and Toothpaste to a list
-- whose UI called everything an "ingredient", so the model was behind the use.
--
-- Three sections. `kitchen` is the default because it is what the pantry was,
-- and because "Cookable now" only makes sense for food — a bathroom row must
-- never make a recipe look uncookable.
ALTER TABLE pantry_items
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'kitchen'
  CHECK (category IN ('kitchen', 'bathroom', 'household'));

COMMENT ON COLUMN pantry_items.category IS
  'OM42 kitchen | bathroom | household — only kitchen rows count towards Cookable now';

-- Sort the rows already there by what they obviously are, rather than leaving
-- toothpaste filed as a cooking ingredient.
UPDATE pantry_items SET category = 'bathroom'
 WHERE category = 'kitchen' AND (
   display_name ILIKE '%toothpaste%' OR display_name ILIKE '%toothbrush%' OR
   display_name ILIKE '%shampoo%'    OR display_name ILIKE '%conditioner%' OR
   display_name ILIKE '%shower%'     OR display_name ILIKE '%soap%'        OR
   display_name ILIKE '%deodorant%'  OR display_name ILIKE '%razor%'       OR
   display_name ILIKE '%floss%'      OR display_name ILIKE '%toilet%'      OR
   display_name ILIKE '%toilette%');

UPDATE pantry_items SET category = 'household'
 WHERE category = 'kitchen' AND (
   display_name ILIKE '%washing powder%' OR display_name ILIKE '%detergent%'   OR
   display_name ILIKE '%fabric soft%'    OR display_name ILIKE '%dishwasher%'  OR
   display_name ILIKE '%washing up%'     OR display_name ILIKE '%washing-up%'  OR
   display_name ILIKE '%bin bag%'        OR display_name ILIKE '%bin liner%'   OR
   display_name ILIKE '%kitchen roll%'   OR display_name ILIKE '%paper towel%' OR
   display_name ILIKE '%sponge%'         OR display_name ILIKE '%bleach%'      OR
   display_name ILIKE '%cleaner%'        OR display_name ILIKE '%cling film%'  OR
   display_name ILIKE '%tin foil%'       OR display_name ILIKE '%batteries%');
