-- OM14 Phase B: Households + invites.
--
-- Phase A (010) gave every shared table a `user_id`, which scoped data per
-- USER — the opposite of this app's premise. Phase B introduces a household
-- and re-scopes everything to it, so Max and Bron share one recipe box.
--
-- Strategy:
--   1. Three new tables: households / household_members / household_invites.
--   2. Nullable `household_id` on each scoped table (recipes, cook_log,
--      recipe_collections, meal_plans, pantry_items).
--   3. A BEFORE INSERT trigger stamps household_id automatically, so no
--      client insert site has to learn about households.
--   4. Backfill: every distinct user_id becomes the owner of their own
--      default household, and their rows are moved into it.
--   5. RLS is rewritten from `user_id = auth.uid()` to household membership.
--      `household_id IS NULL` stays readable by everyone — that is the
--      anonymous fallback Phase A established, and it is what keeps the
--      anon-key API routes working until OM14c hardens them.
--   6. Invites are share-codes, not emails: create_invite() mints a code,
--      accept_invite(code) redeems it. Both SECURITY DEFINER so a stranger
--      never needs read access to household_invites just to redeem a link.
--
-- Idempotent: safe to re-run. Every CREATE uses IF NOT EXISTS, every policy
-- drops before it is created, and the backfill skips users who already have
-- a household.

-- ═══════════════════════════════════════════════════════════════════════
-- Part A — tables
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS households (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL DEFAULT 'My Kitchen',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);

CREATE TABLE IF NOT EXISTS household_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_household_invites_household ON household_invites(household_id);

-- Supabase's default privileges on `public` already grant these, but being
-- explicit keeps the migration self-contained (and reproducible on a plain
-- Postgres). RLS below is what actually restricts access; `anon` is left out
-- because every policy on these three tables requires an auth.uid().
GRANT SELECT, INSERT, UPDATE, DELETE ON households, household_members, household_invites
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Part B — household_id columns + membership helpers
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  scoped TEXT[] := ARRAY['recipes', 'cook_log', 'recipe_collections', 'meal_plans', 'pantry_items'];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS household_id UUID
           REFERENCES households(id) ON DELETE SET NULL', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I(household_id)',
        'idx_' || t || '_household_id', t);
    END IF;
  END LOOP;
END $$;

-- Membership test used by every policy below.
--
-- SECURITY DEFINER is load-bearing, not decoration: household_members itself
-- has RLS, and a policy that read it directly would recurse (the policy on
-- household_members would call the policy on household_members). Running as
-- the owner bypasses RLS and breaks the cycle.
CREATE OR REPLACE FUNCTION is_household_member(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = hid
      AND hm.user_id = auth.uid()
  );
$$;

-- The caller's household. "First membership by joined_at" is arbitrary but
-- deterministic; a real switcher is the OM14d follow-up (plan §4).
CREATE OR REPLACE FUNCTION get_active_household()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
  ORDER BY hm.joined_at, hm.household_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION is_household_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_active_household()     TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Part C — auto-stamp household_id on insert
-- ═══════════════════════════════════════════════════════════════════════
--
-- Keeps every client insert site (collections.ts, pantry.ts, cookLog.ts,
-- MenuContainer) unchanged: they keep stamping user_id, the DB adds the
-- household. BEFORE ROW triggers run before RLS WITH CHECK is evaluated,
-- so the stamped value is what the policy sees.

CREATE OR REPLACE FUNCTION stamp_household_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.household_id := get_active_household();
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t TEXT;
  scoped TEXT[] := ARRAY['recipes', 'cook_log', 'recipe_collections', 'meal_plans', 'pantry_items'];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_household ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_stamp_household BEFORE INSERT ON %I
           FOR EACH ROW EXECUTE FUNCTION stamp_household_id()', t);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Part D — backfill
-- ═══════════════════════════════════════════════════════════════════════
--
-- Each distinct user_id gets its own default household. There is no
-- auto-merge: if two real users already own rows, they end up in two
-- households and merge later by invite (OM14 §8). Re-running is a no-op
-- because a user who already has a membership is skipped.

DO $$
DECLARE
  t       TEXT;
  uid     UUID;
  hid     UUID;
  more    UUID[];
  owners  UUID[] := '{}';
  scoped  TEXT[] := ARRAY['recipes', 'cook_log', 'recipe_collections', 'meal_plans', 'pantry_items'];
BEGIN
  -- Only users with rows that still need placing. Guarding on "has no
  -- household" instead would not be idempotent: a user who has since LEFT
  -- their household still owns placed rows, and a re-run would mint them a
  -- fresh empty household every time.
  FOREACH t IN ARRAY scoped LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'SELECT coalesce(array_agg(DISTINCT user_id), ''{}''::uuid[])
           FROM %I WHERE user_id IS NOT NULL AND household_id IS NULL', t) INTO more;
      owners := owners || more;
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) INTO owners FROM unnest(owners) AS x;

  FOREACH uid IN ARRAY owners LOOP
    SELECT hm.household_id INTO hid
    FROM household_members hm
    WHERE hm.user_id = uid
    ORDER BY hm.joined_at, hm.household_id
    LIMIT 1;

    IF hid IS NULL THEN
      INSERT INTO households (name, created_by) VALUES ('My Kitchen', uid)
      RETURNING id INTO hid;
      INSERT INTO household_members (household_id, user_id, role)
      VALUES (hid, uid, 'owner');
    END IF;

    FOREACH t IN ARRAY scoped LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE %I SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL', t)
        USING hid, uid;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'OM14b backfill: % owner(s) processed', coalesce(array_length(owners, 1), 0);
END $$;

-- Shared-library uniqueness, re-pointed from user to household.
--
-- Phase A relaxed these to (user_id, …) so two users could each have their own
-- "Weeknight Quick"; inside one shared household that is a visible duplicate
-- instead. The Phase A indexes are DROPPED rather than kept alongside: leaving
-- both means a second member's insert can trip the user-scoped index with a
-- 23505 that the client's ON CONFLICT arbiter (now household-scoped) does not
-- absorb, turning a benign duplicate into a hard error.
--
-- Non-partial on purpose: NULL household_id rows are all distinct under NULL
-- index semantics, so the anonymous flow stays unconstrained exactly as it was.
DO $$
BEGIN
  IF to_regclass('public.recipe_collections') IS NOT NULL THEN
    DROP INDEX IF EXISTS uq_recipe_collections_user_name;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_collections_household_name
      ON recipe_collections(household_id, name);
  END IF;
  IF to_regclass('public.pantry_items') IS NOT NULL THEN
    DROP INDEX IF EXISTS uq_pantry_user_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pantry_household_key
      ON pantry_items(household_id, canonical_key);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Part E — RLS rewrite on the scoped tables
-- ═══════════════════════════════════════════════════════════════════════
--
-- SELECT/INSERT/UPDATE keep Phase A's `IS NULL` escape hatch so anonymous
-- and API-route rows stay visible and writable until OM14c.
--
-- DELETE deliberately does NOT get the IS NULL branch. Phase A restricted
-- delete to `user_id = auth.uid()`, which means nobody could delete an
-- anonymous row; widening it to `household_id IS NULL` would hand delete
-- rights on those rows to any unauthenticated caller, and the anon key ships
-- in the client bundle. Members can delete their household's rows; anonymous
-- rows remain undeletable exactly as they are today. (Deviation from plan
-- §5's "DELETE guarded the same way" — recorded in the plan's §11.)

DO $$
DECLARE
  t      TEXT;
  scoped TEXT[] := ARRAY['recipes', 'cook_log', 'recipe_collections', 'meal_plans', 'pantry_items'];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Phase A policies (010) and the pre-auth "all users" ones.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users"   ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert access for all users" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable update access for all users" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable delete access for all users" ON %I', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT
         USING (household_id IS NULL OR is_household_member(household_id))',
      t || '_select', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT
         WITH CHECK (household_id IS NULL OR is_household_member(household_id))',
      t || '_insert', t);

    -- USING keeps the IS NULL branch so a member can adopt an orphan row;
    -- WITH CHECK does NOT, so the row left behind must belong to a household
    -- the caller is in.
    --
    -- This asymmetry is Phase A's shape, and it is load-bearing. A symmetric
    -- `household_id IS NULL OR …` WITH CHECK passes for the anon role, which
    -- would hand every holder of the public anon key (it ships in the client
    -- bundle) write access to every NULL-household row — and until the
    -- repaired claim in Part G runs, that is nearly every row in the table.
    -- Phase A failed closed here because `user_id = auth.uid()` is NULL for
    -- an anonymous caller; this preserves that.
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
         USING      (household_id IS NULL OR is_household_member(household_id))
         WITH CHECK (is_household_member(household_id))',
      t || '_update', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE
         USING (is_household_member(household_id))',
      t || '_delete', t);
  END LOOP;
END $$;

-- recipe_collection_items inherits scope from its parent collection (as in 010).
DO $$
BEGIN
  IF to_regclass('public.recipe_collection_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS rci_all ON recipe_collection_items';
    EXECUTE '
      CREATE POLICY rci_all ON recipe_collection_items FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM recipe_collections c
            WHERE c.id = recipe_collection_items.collection_id
              AND (c.household_id IS NULL OR is_household_member(c.household_id))
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM recipe_collections c
            WHERE c.id = recipe_collection_items.collection_id
              AND (c.household_id IS NULL OR is_household_member(c.household_id))
          )
        )';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Part E2 — RLS on the three new tables
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS households_select ON households;
DROP POLICY IF EXISTS households_update ON households;
-- No INSERT policy: households are created only through ensure_household().
CREATE POLICY households_select ON households FOR SELECT
  USING (is_household_member(id));
CREATE POLICY households_update ON households FOR UPDATE
  USING      (is_household_member(id))
  WITH CHECK (is_household_member(id));

DROP POLICY IF EXISTS household_members_select ON household_members;
DROP POLICY IF EXISTS household_members_delete ON household_members;
-- No INSERT policy: membership is granted only by accept_invite()/ensure_household().
CREATE POLICY household_members_select ON household_members FOR SELECT
  USING (is_household_member(household_id));
-- Leaving is self-service; removing someone else is not (roles are out of scope).
CREATE POLICY household_members_delete ON household_members FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS household_invites_select ON household_invites;
DROP POLICY IF EXISTS household_invites_delete ON household_invites;
-- Invitees never SELECT this table — accept_invite() reads it as definer.
CREATE POLICY household_invites_select ON household_invites FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY household_invites_delete ON household_invites FOR DELETE
  USING (is_household_member(household_id));

-- ═══════════════════════════════════════════════════════════════════════
-- Part F — RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- Returns the caller's household, creating one (with an owner membership) on
-- first use. Also adopts any rows the caller already owns but that predate
-- households, which makes the whole flow self-healing for a user who signed
-- in before 016 landed.
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

-- Mints a single-use, 7-day invite code for the caller's household and
-- returns it. The UI turns it into a /join/<code> link the inviter shares
-- however they like — no mail infrastructure (plan §5).
CREATE OR REPLACE FUNCTION create_invite()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  UUID := auth.uid();
  hid  UUID;
  c    TEXT;
  tries INT := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'create_invite: not authenticated';
  END IF;

  hid := ensure_household();

  LOOP
    tries := tries + 1;
    -- 16 hex chars = 64 bits of entropy, which is ample for a 7-day
    -- single-use code and keeps the link short enough to paste in a chat.
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    BEGIN
      INSERT INTO household_invites (household_id, code, created_by)
      VALUES (hid, c, uid);
      RETURN c;
    EXCEPTION WHEN unique_violation THEN
      IF tries >= 5 THEN
        RAISE EXCEPTION 'create_invite: could not allocate a unique code';
      END IF;
    END;
  END LOOP;
END $$;

-- Redeems a code and returns the household joined. SECURITY DEFINER so the
-- invitee never needs read access to household_invites; validation and the
-- membership insert happen atomically here.
CREATE OR REPLACE FUNCTION accept_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  UUID := auth.uid();
  inv  household_invites%ROWTYPE;
  solo UUID;
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

  -- Merge the joiner's solo household into the one they just joined.
  --
  -- Without this, accepting an invite only grants READ access: the joiner's
  -- own backfilled household stays their "active" one (get_active_household
  -- returns the earliest membership), so everything they add afterwards keeps
  -- landing in the household nobody else can see. Plan §5 anticipated the
  -- merge ("a second real user merges in later via invite"); it assumed the
  -- backfill would produce a single household because claim_orphan_data() had
  -- funnelled the data — that function never actually ran (see Part G), so the
  -- merge has to be explicit.
  --
  -- Only SOLO households are absorbed. A household with other members is
  -- someone else's shared kitchen and is left alone; the joiner simply ends up
  -- in two, and get_active_household picks the earlier (the documented v1
  -- multi-household caveat, plan §8).
  FOR solo IN
    SELECT hm.household_id
    FROM household_members hm
    WHERE hm.user_id = uid
      AND hm.household_id <> inv.household_id
      AND (SELECT count(*) FROM household_members x WHERE x.household_id = hm.household_id) = 1
  LOOP
    -- Pantry duplicates are genuinely redundant (same ingredient, one shelf).
    DELETE FROM pantry_items p
     WHERE p.household_id = solo
       AND EXISTS (
         SELECT 1 FROM pantry_items q
         WHERE q.household_id = inv.household_id AND q.canonical_key = p.canonical_key);
    UPDATE pantry_items SET household_id = inv.household_id WHERE household_id = solo;

    -- Collections collide on name. Suffix rather than delete — dropping one
    -- would cascade its recipe_collection_items and lose the mapping.
    UPDATE recipe_collections c
       SET name = c.name || ' (' || substr(solo::text, 1, 4) || ')'
     WHERE c.household_id = solo
       AND EXISTS (
         SELECT 1 FROM recipe_collections d
         WHERE d.household_id = inv.household_id AND d.name = c.name);
    UPDATE recipe_collections SET household_id = inv.household_id WHERE household_id = solo;

    UPDATE recipes    SET household_id = inv.household_id WHERE household_id = solo;
    UPDATE cook_log   SET household_id = inv.household_id WHERE household_id = solo;
    UPDATE meal_plans SET household_id = inv.household_id WHERE household_id = solo;

    DELETE FROM household_members WHERE household_id = solo;
    DELETE FROM households        WHERE id = solo;
  END LOOP;

  UPDATE household_invites
     SET accepted_by = uid, accepted_at = now()
   WHERE id = inv.id AND accepted_at IS NULL;

  RETURN inv.household_id;
END $$;

-- Member list with emails. auth.users is not client-readable, so this has to
-- be a definer function; co-members already know each other by construction
-- (one invited the other), so exposing the email within a household is fine.
--
-- NB the OUT parameters are prefixed `member_*` on purpose. Naming them
-- user_id/role/joined_at would shadow the columns of the very query below and
-- raise "column reference is ambiguous" at runtime — the exact defect Part G
-- repairs in claim_orphan_data().
CREATE OR REPLACE FUNCTION list_household_members()
RETURNS TABLE (member_id UUID, member_email TEXT, member_role TEXT, member_joined_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'list_household_members: not authenticated';
  END IF;

  hid := get_active_household();
  IF hid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT hm.user_id, u.email::TEXT, hm.role, hm.joined_at
    FROM household_members hm
    JOIN auth.users u ON u.id = hm.user_id
    WHERE hm.household_id = hid
    ORDER BY hm.joined_at;
END $$;

GRANT EXECUTE ON FUNCTION list_household_members() TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_household(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_invite()        TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite(TEXT)    TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Part G — claim_orphan_data() repair + household awareness
-- ═══════════════════════════════════════════════════════════════════════
--
-- 010's version declares an OUT parameter named `table_name` and then runs
--   SELECT 1 FROM information_schema.tables WHERE table_name = 'pantry_items'
-- PL/pgSQL's default `variable_conflict = error` makes that column reference
-- ambiguous against the OUT variable, so the statement raises at runtime and
-- takes the whole function — including the four UPDATEs above it — down with
-- it. The client (AuthContext.maybeClaimOrphans) swallows the error and sets
-- its localStorage flag in a `finally`, so the claim never retried either.
--
-- Fixes here: rename the OUT column (kills the ambiguity), use to_regclass
-- instead of information_schema, and stamp household_id alongside user_id so
-- claiming lands data in the caller's household in one pass.
--
-- Renaming an OUT column changes the signature, so this must DROP first;
-- CREATE OR REPLACE cannot do it.

DROP FUNCTION IF EXISTS claim_orphan_data();

CREATE FUNCTION claim_orphan_data()
RETURNS TABLE (claimed_table TEXT, claimed_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  uid UUID := auth.uid();
  hid UUID;
  cnt BIGINT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'claim_orphan_data: not authenticated';
  END IF;

  -- SECURITY INVOKER keeps the UPDATEs under RLS (household_id IS NULL passes
  -- USING, the new household_id passes WITH CHECK), but the household itself
  -- must be created as definer — hence the nested call.
  hid := ensure_household();

  -- `user_id IS NULL OR user_id = uid` matters: a row belonging to another
  -- user that somehow has no household yet is NOT an orphan, and RLS would
  -- happily let this UPDATE take it (household_id IS NULL passes USING).
  UPDATE recipes SET user_id = uid, household_id = hid
   WHERE household_id IS NULL AND (user_id IS NULL OR user_id = uid);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  claimed_table := 'recipes'; claimed_count := cnt; RETURN NEXT;

  UPDATE cook_log SET user_id = uid, household_id = hid
   WHERE household_id IS NULL AND (user_id IS NULL OR user_id = uid);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  claimed_table := 'cook_log'; claimed_count := cnt; RETURN NEXT;

  UPDATE recipe_collections SET user_id = uid, household_id = hid
   WHERE household_id IS NULL AND (user_id IS NULL OR user_id = uid);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  claimed_table := 'recipe_collections'; claimed_count := cnt; RETURN NEXT;

  UPDATE meal_plans SET user_id = uid, household_id = hid
   WHERE household_id IS NULL AND (user_id IS NULL OR user_id = uid);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  claimed_table := 'meal_plans'; claimed_count := cnt; RETURN NEXT;

  IF to_regclass('public.pantry_items') IS NOT NULL THEN
    UPDATE pantry_items SET user_id = uid, household_id = hid
     WHERE household_id IS NULL AND (user_id IS NULL OR user_id = uid);
    GET DIAGNOSTICS cnt = ROW_COUNT;
    claimed_table := 'pantry_items'; claimed_count := cnt; RETURN NEXT;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION claim_orphan_data() TO authenticated;
