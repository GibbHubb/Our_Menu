-- ═══════════════════════════════════════════════════════════════════════
-- 027 — OM67: rekey ingredient keys saved under the old normaliser
-- ═══════════════════════════════════════════════════════════════════════
--
-- Before OM66 the suffix rules ran ahead of the alias table, so stored keys
-- could read "chilly" (from "chillies"), "bay leave" (from "bay leaves"),
-- "loave", "halve". Before OM67, "chili"/"chilies" kept their own key
-- beside "chilli". New lines now key to "chilli" / "leaf" / "loaf" / "half",
-- so an old row would sit next to a new one instead of merging.
--
-- Before-counts, READ-ONLY REST query against prod, 2026-11-17:
--   shopping_extras  13 rows, 1 household; keys matching chil|leave|loave|halve:
--                    'finely-chopped sage leaf' x1 (already the new form)
--   pantry_items     30 rows, 1 household; 0 matching keys
--   => no legacy key exists in prod today. This file is a no-op there and is
--      kept so a row saved by an older client before the deploy still gets
--      fixed. NOT RUN by the agent; Max applies it.
--
-- Word-level (\m \M are Postgres word boundaries), so "red chilly" and
-- "chilly flake" are covered. Idempotent: every legacy word maps to a word the
-- pattern no longer matches, so a second run updates 0 rows.
--
-- Collisions: shopping_extras has a UNIQUE merge index (household, item_key,
-- family, count-unit) and pantry_items is UNIQUE (household_id, canonical_key).
-- Where rekeyed rows would collide, they are collapsed to one first: amounts
-- summed into the survivor (shopping, ticks of the dropped rows deleted too),
-- or the extra row dropped (pantry: presence only).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.om67_rekey(k TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           k,
           '\m(chilly|chili)\M', 'chilli', 'g'),
           '\mleave\M', 'leaf', 'g'),
           '\mloave\M', 'loaf', 'g'),
           '\mhalve\M', 'half', 'g')
$$;

-- ── shopping_extras ────────────────────────────────────────────────────

-- 1. Collapse every merge slot that the rekey would make collide (a legacy
--    row beside a new one, OR two legacy spellings like "chilly" + "chili").
--    Survivor: a row already on the new key, else the oldest. Its amount
--    becomes the slot total when every row carries one; a slot mixing a
--    number with "no number" keeps the survivor's own value.
WITH slot AS (
  SELECT id, item_key, qty_base,
         first_value(id) OVER w                       AS keep_id,
         count(*)        OVER p                       AS n,
         count(qty_base) OVER p                       AS n_qty,
         sum(qty_base)   OVER p                       AS total,
         bool_or(item_key <> pg_temp.om67_rekey(item_key)) OVER p AS has_legacy
    FROM shopping_extras
   WHERE item_key <> ''
  WINDOW p AS (PARTITION BY household_id, pg_temp.om67_rekey(item_key), coalesce(family, ''),
                            (CASE WHEN family = 'count' THEN coalesce(unit_hint, '') ELSE '' END)),
         w AS (PARTITION BY household_id, pg_temp.om67_rekey(item_key), coalesce(family, ''),
                            (CASE WHEN family = 'count' THEN coalesce(unit_hint, '') ELSE '' END)
               ORDER BY (item_key <> pg_temp.om67_rekey(item_key)), created_at, id)
), clash AS (
  SELECT * FROM slot WHERE has_legacy AND n > 1
), merged AS (
  UPDATE shopping_extras s
     SET qty_base = c.total
    FROM clash c
   WHERE s.id = c.id AND c.id = c.keep_id AND c.n_qty = c.n
  RETURNING s.id
), ticks AS (
  DELETE FROM shopping_ticks t
   USING clash c
   WHERE c.id <> c.keep_id AND t.line_key = 'extra:' || c.id::text
  RETURNING 1
)
DELETE FROM shopping_extras s USING clash c WHERE s.id = c.id AND c.id <> c.keep_id;

-- 2. Everything else just takes the new key.
UPDATE shopping_extras
   SET item_key = pg_temp.om67_rekey(item_key)
 WHERE item_key <> pg_temp.om67_rekey(item_key);

-- ── pantry_items ───────────────────────────────────────────────────────

-- Presence only: keep one row per (household, new key), preferring one
-- already on the new key, then the oldest.
DELETE FROM pantry_items p
 USING (
   SELECT id, row_number() OVER (
            PARTITION BY household_id, pg_temp.om67_rekey(canonical_key)
            ORDER BY (canonical_key <> pg_temp.om67_rekey(canonical_key)), added_at, id) AS rn,
          bool_or(canonical_key <> pg_temp.om67_rekey(canonical_key)) OVER (
            PARTITION BY household_id, pg_temp.om67_rekey(canonical_key)) AS has_legacy
     FROM pantry_items
 ) d
 WHERE p.id = d.id AND d.has_legacy AND d.rn > 1;

UPDATE pantry_items
   SET canonical_key = pg_temp.om67_rekey(canonical_key)
 WHERE canonical_key <> pg_temp.om67_rekey(canonical_key);

-- ── after: both must be 0 ──────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM shopping_extras WHERE item_key <> pg_temp.om67_rekey(item_key);
  IF n > 0 THEN RAISE EXCEPTION 'OM67: % shopping_extras rows still legacy', n; END IF;
  SELECT count(*) INTO n FROM pantry_items WHERE canonical_key <> pg_temp.om67_rekey(canonical_key);
  IF n > 0 THEN RAISE EXCEPTION 'OM67: % pantry_items rows still legacy', n; END IF;
END $$;

COMMIT;
