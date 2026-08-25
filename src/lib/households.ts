// OM14 Phase B — household reads/writes.
//
// Everything that mutates membership goes through a SECURITY DEFINER RPC
// (migration 016) rather than a direct table write, so the client never needs
// broad access to household_members or household_invites. Reads are plain
// selects — RLS already scopes them to the caller's household.

import { supabase } from './supabaseClient';

export interface Household {
  id:         string;
  name:       string;
  created_by: string | null;
  created_at: string;
}

export interface HouseholdMember {
  user_id:   string;
  email:     string | null;
  role:      'owner' | 'member';
  joined_at: string;
}

/** Shape returned by the household_members → households embed. */
interface MembershipRow {
  household_id: string;
  households:   Household | Household[] | null;
}

/**
 * The caller's household, or null if they have none yet (never created one,
 * never accepted an invite). Does not create — use ensureHousehold() for that.
 */
export async function getMyHousehold(): Promise<Household | null> {
  // OM39(d) — this used to take the EARLIEST membership while the DB's
  // get_active_household() takes the most recently activated one. For anyone in
  // two households the /households screen therefore managed a different kitchen
  // than the one new recipes land in, and its Leave button was not the
  // household the user thought they were leaving. Same ordering as 019 now.
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, activated_at, joined_at, households(id, name, created_by, created_at)')
    .order('activated_at', { ascending: false, nullsFirst: false })
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) { console.error('getMyHousehold:', error); return null; }
  if (!data) return null;

  // PostgREST returns the embed as an object for a to-one relationship, but
  // the generated types widen it to an array — normalise both.
  const h = (data as MembershipRow).households;
  if (!h) return null;
  return Array.isArray(h) ? (h[0] ?? null) : h;
}

/**
 * The caller's household, creating one on first use. Also adopts any rows the
 * caller already owns that predate households (see ensure_household() in 016).
 */
export async function ensureHousehold(name?: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_household', {
    p_name: name?.trim() || null,
  });
  if (error) { console.error('ensureHousehold:', error); return null; }
  return (data as string) ?? null;
}

export async function listMembers(): Promise<HouseholdMember[]> {
  const { data, error } = await supabase.rpc('list_household_members');
  if (error) { console.error('listMembers:', error); return []; }
  const rows = (data ?? []) as Array<{
    member_id: string;
    member_email: string | null;
    member_role: 'owner' | 'member';
    member_joined_at: string;
  }>;
  return rows.map((r) => ({
    user_id:   r.member_id,
    email:     r.member_email,
    role:      r.member_role,
    joined_at: r.member_joined_at,
  }));
}

export async function renameHousehold(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const { error } = await supabase.from('households').update({ name: trimmed }).eq('id', id);
  if (error) { console.error('renameHousehold:', error); return false; }
  return true;
}

/**
 * Mints a single-use invite code (7-day expiry). The caller turns it into a
 * /join/<code> link — there is no email delivery by design (plan §5).
 * Throws with the DB's message so the UI can show why it failed.
 */
export async function createInvite(): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('create_invite returned no code');
  return data as string;
}

/**
 * Redeems an invite code; resolves to the household id joined.
 *
 * OM35(d): this now grants MEMBERSHIP ONLY and activates the joined household.
 * It used to also absorb the joiner's own kitchen and delete it — irreversibly,
 * since a leaver's rows stay behind. Moving your recipes across is
 * `mergeHouseholdInto`, asked for separately.
 */
export async function acceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invite', { p_code: code });
  if (error) throw new Error(error.message);
  return data as string;
}

/** What a merge into `householdId` would move out of the caller's own kitchen. */
export interface MergePreview {
  sourceHousehold: string;
  recipes:     number;
  cookLog:     number;
  mealPlans:   number;
  collections: number;
  pantryItems: number;
}

/** True when there is anything at all to move. */
export function mergePreviewIsEmpty(rows: MergePreview[]): boolean {
  return rows.every(
    (r) => r.recipes + r.cookLog + r.mealPlans + r.collections + r.pantryItems === 0,
  );
}

/**
 * Counts of what `mergeHouseholdInto` would transfer — per table, deliberately
 * not as a single total. "Everything you own" is not a number anyone can
 * meaningfully consent to.
 */
export async function previewMerge(householdId: string): Promise<MergePreview[]> {
  const { data, error } = await supabase.rpc('preview_merge_household', {
    p_target: householdId,
  });
  if (error) { console.error('previewMerge:', error); return []; }
  const rows = (data ?? []) as Array<{
    source_household: string;
    recipes: number; cook_log: number; meal_plans: number;
    collections: number; pantry_items: number;
  }>;
  return rows.map((r) => ({
    sourceHousehold: r.source_household,
    recipes:     Number(r.recipes),
    cookLog:     Number(r.cook_log),
    mealPlans:   Number(r.meal_plans),
    collections: Number(r.collections),
    pantryItems: Number(r.pantry_items),
  }));
}

/**
 * Moves the caller's own solo household(s) into `householdId` and deletes them.
 *
 * ⚠️ Not reversible. A leaver's rows stay with the household, so this cannot be
 * undone by leaving afterwards. Always show `previewMerge` first.
 */
export async function mergeHouseholdInto(householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc('merge_household_into', {
    p_target: householdId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/** Switch which household new recipes land in. Reversible, moves nothing. */
export async function setActiveHousehold(householdId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_active_household', {
    p_household: householdId,
  });
  if (error) { console.error('setActiveHousehold:', error); return null; }
  return (data as string) ?? null;
}

/**
 * Leaves a household. Rows the leaver authored stay with the household —
 * they don't take the recipes with them (settled at agree time, plan §8).
 */
export async function leaveHousehold(householdId: string): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return false;
  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', uid);
  if (error) { console.error('leaveHousehold:', error); return false; }
  return true;
}

/** Absolute /join/<code> URL for a freshly-minted code. */
export function inviteUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join/${code}`;
}
