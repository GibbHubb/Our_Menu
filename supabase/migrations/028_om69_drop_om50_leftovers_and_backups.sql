-- ═══════════════════════════════════════════════════════════════════════
-- 028 — OM69: make the migration files match prod
-- ═══════════════════════════════════════════════════════════════════════
--
-- Part A records OM50's hand-run drops (2026-09-22). 020 still creates
-- `meal_basket`, `pantry_items.needed` and `shopping_extras.checked`; prod
-- has none of the three. 023 stopped the app reading them and said dropping
-- them was a separate ticket; OM50 did it by hand and no file said so.
--
-- Part B drops the two hand-made backup tables. Max decided, 2026-11-25:
-- export, then drop. No migration creates them, no app code reads them, and
-- 025 only turned RLS on and revoked grants (both guarded by to_regclass).
--
-- Measured READ-ONLY against prod (Management API), 2026-11-25:
--   meal_basket                         absent
--   pantry_items.needed                 absent
--   shopping_extras.checked             absent
--   public.recipes_backup_om40          present, 96 rows, 168 kB
--   public.recipes_orphan_backup_2026_08_26  present, 82 rows, 72 kB
--   dependents of the two backups: their 025 deny_all policy only
--                                   (no FK, no view)
-- Exported in full before this file was written, row counts verified:
--   backlog_bandit reports/our_menu/om69_backup_export_2026-11-25/
--     recipes_backup_om40.json (96), recipes_orphan_backup_2026_08_26.json (82)
--
-- So on prod Part A is a no-op and Part B drops two tables. On a database
-- rebuilt from 001 the backups never existed, so Part B is the no-op and
-- Part A removes what 020/021 created.
--
-- Guards (RAISE, so the whole transaction rolls back):
--   * a backup whose row count is not the exported count is not dropped:
--     anything written after the export would be lost with it.
--   * `meal_basket` holding rows is not dropped (a rebuilt database has none).
--
-- Idempotent: every DROP is IF EXISTS and every guard skips a missing table;
-- a second run does nothing. NOT RUN by the agent; Max applies it.
--
-- Reversal: Part A, re-run 020 and 021 (both idempotent; the tables come back
-- empty). Part B, recreate each table from its JSON export.

BEGIN;

-- ── Guards ─────────────────────────────────────────────────────────────

DO $$
DECLARE n BIGINT;
BEGIN
  IF to_regclass('public.recipes_backup_om40') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.recipes_backup_om40;
    IF n <> 96 THEN
      RAISE EXCEPTION 'OM69: recipes_backup_om40 has % rows, export has 96. Re-export first.', n;
    END IF;
  END IF;

  IF to_regclass('public.recipes_orphan_backup_2026_08_26') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.recipes_orphan_backup_2026_08_26;
    IF n <> 82 THEN
      RAISE EXCEPTION 'OM69: recipes_orphan_backup_2026_08_26 has % rows, export has 82. Re-export first.', n;
    END IF;
  END IF;

  IF to_regclass('public.meal_basket') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.meal_basket;
    IF n <> 0 THEN
      RAISE EXCEPTION 'OM69: meal_basket has % rows; refusing to drop live data.', n;
    END IF;
  END IF;
END $$;

-- ── Part A — OM50's hand-run drops, recorded ───────────────────────────

DROP TABLE IF EXISTS public.meal_basket;
ALTER TABLE public.pantry_items    DROP COLUMN IF EXISTS needed;
ALTER TABLE public.shopping_extras DROP COLUMN IF EXISTS checked;

-- ── Part B — the hand-made backups (exported 2026-11-25) ───────────────

DROP TABLE IF EXISTS public.recipes_backup_om40;
DROP TABLE IF EXISTS public.recipes_orphan_backup_2026_08_26;

COMMIT;
