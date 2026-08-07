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
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, households(id, name, created_by, created_at)')
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

/** Redeems an invite code; resolves to the household id joined. */
export async function acceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invite', { p_code: code });
  if (error) throw new Error(error.message);
  return data as string;
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
