-- OM14b hotfix: ensure_household() had a check-then-insert race.
--
-- What happened (production, 2026-08-07 10:49:02):
--   Max's first sign-in created SIX "My Kitchen" households inside 25ms.
--   AuthContext fires maybeClaimOrphans() from both getSession().then() and
--   onAuthStateChange, so several claim_orphan_data() calls ran concurrently.
--   Each called ensure_household(), which did:
--       SELECT household_id ... WHERE user_id = uid   -- all six saw nothing
--       INSERT INTO households ...                    -- so all six inserted
--   Nothing constrains a user to one household (multi-household is allowed by
--   design), so there was no error — just five surplus empty households.
--
--   The data itself was fine: claim_orphan_data updates WHERE household_id IS
--   NULL, so the first transaction to commit took all 96 recipes and the other
--   five found nothing left to claim. The extras were empty shells.
--
-- Why it still mattered: get_active_household() picks the earliest membership.
-- If the populated household were ever left or removed, it would silently flip
-- to an empty one and new recipes would land somewhere the user cannot see.
-- accept_invite()'s merge also only absorbs SOLO households, so the surplus
-- would have survived an invite and fragmented the library.
--
-- Fix: serialise per-user with a transaction-scoped advisory lock, then
-- re-check inside the lock. Concurrent callers queue, and the loser sees the
-- winner's committed row instead of inserting its own.

-- ── Part A — the race ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_household(p_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    UUID := auth.uid();
  hid    UUID;
  t      TEXT;
  scoped TEXT[] := ARRAY['recipes', 'cook_log', 'recipe_collections', 'meal_plans', 'pantry_items'];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'ensure_household: not authenticated';
  END IF;

  -- Serialise concurrent callers for THIS user only. Transaction-scoped, so
  -- it releases on commit/rollback with no unlock path to forget. Everything
  -- below now runs exactly once per user, however many tabs or listeners fire.
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  -- Re-check inside the lock: a caller that queued here will now see the row
  -- the winner committed.
  SELECT hm.household_id INTO hid
  FROM household_members hm
  WHERE hm.user_id = uid
  ORDER BY hm.joined_at, hm.household_id
  LIMIT 1;

  IF hid IS NOT NULL THEN
    RETURN hid;
  END IF;

  INSERT INTO households (name, created_by)
  VALUES (coalesce(nullif(btrim(p_name), ''), 'My Kitchen'), uid)
  RETURNING id INTO hid;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (hid, uid, 'owner');

  FOREACH t IN ARRAY scoped LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'UPDATE %I SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL', t)
      USING hid, uid;
    END IF;
  END LOOP;

  RETURN hid;
END $$;

GRANT EXECUTE ON FUNCTION ensure_household(TEXT) TO authenticated;

-- ── Part B — clean up households the race already created ───────────────
--
-- Deliberately narrow. A household is removed ONLY when all of:
--   * it holds zero rows across every scoped table,
--   * it has exactly one member, and
--   * it is not that member's earliest-joined (i.e. active) household.
--
-- So a genuinely empty household someone made on purpose and still uses as
-- their active one survives, and a shared household is never touched.
-- Idempotent: a second run finds nothing.

DO $$
DECLARE
  victim UUID;
  n      INT := 0;
BEGIN
  FOR victim IN
    WITH usage AS (
      SELECT h.id,
             (SELECT count(*) FROM recipes            r  WHERE r.household_id  = h.id)
           + (SELECT count(*) FROM cook_log           c  WHERE c.household_id  = h.id)
           + (SELECT count(*) FROM recipe_collections rc WHERE rc.household_id = h.id)
           + (SELECT count(*) FROM meal_plans         mp WHERE mp.household_id = h.id)
           + (SELECT count(*) FROM pantry_items       p  WHERE p.household_id  = h.id) AS rows_held,
             (SELECT count(*) FROM household_members  m  WHERE m.household_id  = h.id) AS members
      FROM households h
    ),
    active AS (
      SELECT DISTINCT ON (m.user_id) m.household_id
      FROM household_members m
      ORDER BY m.user_id, m.joined_at, m.household_id
    )
    SELECT u.id
    FROM usage u
    WHERE u.rows_held = 0
      AND u.members   = 1
      AND u.id NOT IN (SELECT household_id FROM active)
  LOOP
    DELETE FROM households WHERE id = victim;  -- members cascade
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'OM14b hotfix: removed % surplus empty household(s)', n;
END $$;
