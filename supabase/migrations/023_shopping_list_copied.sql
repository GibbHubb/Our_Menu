-- ═══════════════════════════════════════════════════════════════════════
-- 023 — OM49: the shopping list stops being DERIVED and starts being COPIED
-- ═══════════════════════════════════════════════════════════════════════
--
-- Max + Bron, 2026-08-27: "we are no longer treating this like a pantry
-- tracker. Each time we shop we go through the list to see if we need
-- anything, and if we click them it goes to the shopping list."
--
-- Until now the list was a live projection of `meal_basket` (dishes in, minus
-- whatever `excluded` said you'd unticked, minus whatever the pantry claimed
-- you owned). Three sections on the page, three sources, and no single row you
-- could point at and say "that is on the list". Pressing Add now takes a
-- SNAPSHOT instead: the ticked lines, already scaled to the servings you chose,
-- become plain rows that no longer care which recipe they came from. That is
-- what makes "Checked out -> the list resets" one honest operation rather than
-- an unwinding of a basket.
--
-- `shopping_extras` is that one list. It was already the hand-typed half, is
-- already household-scoped with the right RLS and stamping trigger, and already
-- ticks through `shopping_ticks` (OM46) — so it grows four columns rather than
-- a new table getting a fifth copy of the policy boilerplate.
--
--   item_key   what two lines must share to become one line. Canonical, so
--              "2 cans tinned tomatoes" from one recipe and "1 can" from
--              another merge even though the text differs.
--   qty_base   the amount in the family's BASE unit (g / ml / one-of-them),
--              which is what makes merging arithmetic instead of guesswork.
--              NULL means the line carried no number — never zero, because
--              "salt and pepper" is not 0 g of salt.
--   family     mass | volume | count. Merging happens WITHIN a family only:
--              200 g tomatoes and 1 can of tomatoes stay two lines, because
--              inventing a g<->can conversion would put a wrong number in
--              front of someone standing in a shop.
--   unit_hint  the unit to render back in, so 2 tbsp + 1 tbsp reads "3 tbsp"
--              and not "45 ml", which is not how anyone shops.
--
-- Idempotent: safe to re-run.

-- ── Part A — the columns ───────────────────────────────────────────────

ALTER TABLE shopping_extras
  ADD COLUMN IF NOT EXISTS item_key  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qty_base  NUMERIC,
  ADD COLUMN IF NOT EXISTS family    TEXT,
  ADD COLUMN IF NOT EXISTS unit_hint TEXT;

ALTER TABLE shopping_extras DROP CONSTRAINT IF EXISTS shopping_extras_family_check;
ALTER TABLE shopping_extras ADD CONSTRAINT shopping_extras_family_check
  CHECK (family IS NULL OR family IN ('mass', 'volume', 'count'));

COMMENT ON TABLE  shopping_extras       IS 'OM49 THE shopping list — copied lines, hand-typed items and pantry picks alike. Not derived from anything.';
COMMENT ON COLUMN shopping_extras.label IS 'OM49 the bare item name ("tinned tomatoes") — the amount is rendered from qty_base, never baked into this string';
COMMENT ON COLUMN shopping_extras.item_key  IS 'OM49 canonical merge key; two rows sharing it AND a family are one line';
COMMENT ON COLUMN shopping_extras.qty_base  IS 'OM49 amount in the family base unit (g/ml/each); NULL = the line carried no number';
COMMENT ON COLUMN shopping_extras.family    IS 'OM49 mass|volume|count — amounts merge inside a family and never across one';
COMMENT ON COLUMN shopping_extras.unit_hint IS 'OM49 render the total back in this unit (tbsp, can) rather than the base unit';

-- Rows that predate this: their label IS the whole line, so key off it. Doing
-- it here rather than leaving them at '' means an old hand-typed "Rice" still
-- merges with a new one instead of sitting beside it forever.
UPDATE shopping_extras SET item_key = lower(trim(label)) WHERE item_key = '';

-- ── Part B — one row per thing ─────────────────────────────────────────
--
-- OM49 review finding 2: nothing stopped "Rice" being added twice. Before the
-- index can enforce that, whatever is already duplicated has to go — keep the
-- oldest of each pair, since that is the one whose id any existing tick or
-- clipboard copy refers to.

-- ⚠️ The bucket is the family PLUS, for counted things, the counted noun.
-- `can`, `clove`, `bunch` and `packet` are all family `count` with base 1, so
-- keying on the family alone would add "2 cans tinned tomatoes" to "3 tinned
-- tomatoes" and render **5 cans** — the exact wrong-number-in-a-shop the
-- cross-family rule exists to prevent. Mass and volume are exempt because
-- their conversion IS exact: 500 g + 1 kg really is 1500 g.
DELETE FROM shopping_extras a
 USING shopping_extras b
 WHERE a.household_id IS NOT DISTINCT FROM b.household_id
   AND a.item_key = b.item_key
   AND coalesce(a.family, '') = coalesce(b.family, '')
   AND (CASE WHEN a.family = 'count' THEN coalesce(a.unit_hint, '') ELSE '' END)
     = (CASE WHEN b.family = 'count' THEN coalesce(b.unit_hint, '') ELSE '' END)
   AND a.item_key <> ''
   AND (a.created_at, a.id) > (b.created_at, b.id);

DROP INDEX IF EXISTS shopping_extras_merge_key;
CREATE UNIQUE INDEX shopping_extras_merge_key
  ON shopping_extras (
       household_id,
       item_key,
       coalesce(family, ''),
       (CASE WHEN family = 'count' THEN coalesce(unit_hint, '') ELSE '' END))
  WHERE item_key <> '';

-- ── Part C — what this does NOT do ─────────────────────────────────────
--
-- `meal_basket` and `pantry_items.needed` are left exactly as they are. The app
-- stops reading both, and dropping them is a separate ticket: a migration that
-- deletes the old model in the same breath as shipping the new one leaves no
-- way back if the new one is wrong. `shopping_extras.checked` goes the same way
-- — `shopping_ticks` has been the truth since OM46 and nothing writes it now.
