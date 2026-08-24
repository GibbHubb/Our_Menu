-- ═══════════════════════════════════════════════════════════════════════
-- 019 — OM35(d): joining a household no longer merges your kitchen into it
-- ═══════════════════════════════════════════════════════════════════════
--
-- The problem
-- -----------
-- 016's accept_invite() did two things in one call: granted membership, AND
-- absorbed the joiner's solo household — moving every recipe, cook_log entry,
-- meal plan, collection and pantry item into the inviter's household and then
-- DELETING the joiner's household outright.
--
-- That is irreversible by design elsewhere in the model: a leaver's rows stay
-- with the household (plan §8, settled), so the joiner cannot undo it by
-- leaving. One click on a link permanently transfers everything they own, and
-- the only thing standing between a user and that outcome was a sentence of
-- disclosure text on the join page.
--
-- The security review flagged it MEDIUM (was OM14b-fu). Max's call on
-- 2026-08-24: split join from merge.
--
-- The shape now
-- -------------
--   accept_invite(code)          → membership only. Reversible: leave and you
--                                  are back where you started, kitchen intact.
--   preview_merge_household(hid) → what WOULD move. Numbers before the act.
--   merge_household_into(hid)    → the transfer, as a separate deliberate
--                                  action the user asks for by name.
--
-- Why this migration also touches "active household"
-- --------------------------------------------------
-- The merge was not gratuitous — it solved a real problem. get_active_household()
-- returns the EARLIEST membership, so a joiner who is merely granted membership
-- keeps landing new recipes in their own solo household, invisible to the
-- kitchen they just joined. Splitting the two without addressing that would
-- ship a join that silently appears to do nothing.
--
-- So membership now carries `activated_at`, and the active household is the
-- most recently activated one (falling back to the earliest joined, which is
-- exactly today's behaviour for everyone who never switches). Accepting an
-- invite activates the household you just joined.
--
-- That is a PREFERENCE, not a data move: it changes where new rows land and is
-- flipped back with one call. Nothing is destroyed, which is the whole point.
--
-- Idempotent: safe to re-run.

-- ── Part A — activated_at on membership ────────────────────────────────

ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Most-recently-activated wins; NULLs sort last so anyone who has never
-- switched keeps the 016 behaviour (earliest membership) unchanged.
CREATE OR REPLACE FUNCTION get_active_household()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
  ORDER BY hm.activated_at DESC NULLS LAST, hm.joined_at, hm.household_id
  LIMIT 1
$$;

-- Switch which household new rows land in. Membership is required, so this
-- cannot be used to point at a stranger's kitchen.
CREATE OR REPLACE FUNCTION set_active_household(p_household UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'set_active_household: not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM household_members
    WHERE user_id = uid AND household_id = p_household
  ) THEN
    RAISE EXCEPTION 'set_active_household: you are not a member of that household';
  END IF;

  -- Clear first, then stamp: exactly one activated row per user keeps the
  -- ORDER BY unambiguous.
  UPDATE household_members SET activated_at = NULL
   WHERE user_id = uid AND activated_at IS NOT NULL;
  UPDATE household_members SET activated_at = now()
   WHERE user_id = uid AND household_id = p_household;

  RETURN p_household;
END $$;

-- ── Part B — accept_invite grants membership ONLY ──────────────────────

CREATE OR REPLACE FUNCTION accept_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  inv household_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'accept_invite: not authenticated';
  END IF;

  SELECT * INTO inv FROM household_invites WHERE code = btrim(p_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_invite: that invite link is not valid';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'accept_invite: that invite link has expired';
  END IF;
  IF inv.accepted_at IS NOT NULL AND inv.accepted_by IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'accept_invite: that invite link has already been used';
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (inv.household_id, uid, 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  -- OM35(d): the merge that used to live here is now merge_household_into().
  -- Activating the joined household is what makes a membership-only join feel
  -- like joining — new recipes land in the shared kitchen from this point on.
  -- The joiner's own household is untouched and still theirs.
  PERFORM set_active_household(inv.household_id);

  UPDATE household_invites
     SET accepted_by = uid, accepted_at = now()
   WHERE id = inv.id AND accepted_at IS NULL;

  RETURN inv.household_id;
END $$;

-- ── Part C — preview: the numbers, before the act ──────────────────────

-- What would move out of the caller's OTHER solo households into p_target.
-- Returned per table so the UI can state it plainly rather than as a total —
-- "everything you own" is not a number anyone can consent to.
CREATE OR REPLACE FUNCTION preview_merge_household(p_target UUID)
RETURNS TABLE (
  source_household UUID,
  recipes          BIGINT,
  cook_log         BIGINT,
  meal_plans       BIGINT,
  collections      BIGINT,
  pantry_items     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'preview_merge_household: not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    hm.household_id,
    (SELECT count(*) FROM recipes            r WHERE r.household_id = hm.household_id),
    (SELECT count(*) FROM cook_log           c WHERE c.household_id = hm.household_id),
    (SELECT count(*) FROM meal_plans         m WHERE m.household_id = hm.household_id),
    (SELECT count(*) FROM recipe_collections k WHERE k.household_id = hm.household_id),
    (SELECT count(*) FROM pantry_items       p WHERE p.household_id = hm.household_id)
  FROM household_members hm
  WHERE hm.user_id = uid
    AND hm.household_id <> p_target
    AND (SELECT count(*) FROM household_members x
          WHERE x.household_id = hm.household_id) = 1;
END $$;

-- ── Part D — the merge, as its own deliberate action ───────────────────

-- Body is 016's loop, unchanged in what it does — only in when it happens.
-- Still SOLO households only: a household with other members is someone
-- else's shared kitchen and is never absorbed.
CREATE OR REPLACE FUNCTION merge_household_into(p_target UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    UUID := auth.uid();
  solo   UUID;
  merged INTEGER := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'merge_household_into: not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM household_members
    WHERE user_id = uid AND household_id = p_target
  ) THEN
    RAISE EXCEPTION 'merge_household_into: you are not a member of that household';
  END IF;

  FOR solo IN
    SELECT hm.household_id
    FROM household_members hm
    WHERE hm.user_id = uid
      AND hm.household_id <> p_target
      AND (SELECT count(*) FROM household_members x
            WHERE x.household_id = hm.household_id) = 1
  LOOP
    -- Pantry duplicates are genuinely redundant (same ingredient, one shelf).
    DELETE FROM pantry_items p
     WHERE p.household_id = solo
       AND EXISTS (
         SELECT 1 FROM pantry_items q
         WHERE q.household_id = p_target AND q.canonical_key = p.canonical_key);
    UPDATE pantry_items SET household_id = p_target WHERE household_id = solo;

    -- Collections collide on name. Suffix rather than delete — dropping one
    -- would cascade its recipe_collection_items and lose the mapping.
    UPDATE recipe_collections c
       SET name = c.name || ' (' || substr(solo::text, 1, 4) || ')'
     WHERE c.household_id = solo
       AND EXISTS (
         SELECT 1 FROM recipe_collections d
         WHERE d.household_id = p_target AND d.name = c.name);
    UPDATE recipe_collections SET household_id = p_target WHERE household_id = solo;

    UPDATE recipes    SET household_id = p_target WHERE household_id = solo;
    UPDATE cook_log   SET household_id = p_target WHERE household_id = solo;
    UPDATE meal_plans SET household_id = p_target WHERE household_id = solo;

    DELETE FROM household_members WHERE household_id = solo;
    DELETE FROM households        WHERE id = solo;
    merged := merged + 1;
  END LOOP;

  -- The absorbed households are gone, so make sure the survivor is active.
  PERFORM set_active_household(p_target);
  RETURN merged;
END $$;

-- ── Part E — grants ────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION set_active_household(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION preview_merge_household(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION merge_household_into(UUID)     TO authenticated;
