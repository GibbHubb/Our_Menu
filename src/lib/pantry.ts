// OM12 — Pantry CRUD + match helpers.
// Single-tenant for v1 (no user_id) — matches the rest of the app.

import { supabase } from './supabaseClient';
import { canonicaliseIngredient } from './ingredients';

export interface PantryItem {
  id: string;
  canonical_key: string;
  display_name:  string;
  added_at: string;
  /** OM40 — "we're low on this"; shows up under Staples on the shopping list. */
  needed: boolean;
}

/**
 * OM40 — flag/unflag a staple as needing to be bought.
 *
 * Deliberately separate from removing it from the pantry: being out of olive
 * oil doesn't mean olive oil stops being something you keep in the house, and
 * deleting it would drop it out of the "Cookable now" calculation too.
 */
export async function setPantryNeeded(id: string, needed: boolean): Promise<void> {
  const { error } = await supabase.from('pantry_items').update({ needed }).eq('id', id);
  if (error) console.error('setPantryNeeded:', error);
}

export async function getPantryItems(): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .order('display_name');
  if (error) {
    console.error('getPantryItems:', error);
    return [];
  }
  return (data ?? []) as PantryItem[];
}

/** OM14 Phase A — stamp user_id on inserts when there's a session. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Insert one pantry item; returns null if the canonical key already exists. */
export async function addPantryItem(displayName: string): Promise<PantryItem | null> {
  const key = canonicaliseIngredient(displayName);
  if (!key) return null;
  const uid = await currentUserId();
  const row = uid
    ? { canonical_key: key, display_name: displayName.trim(), user_id: uid }
    : { canonical_key: key, display_name: displayName.trim() };
  const { data, error } = await supabase
    .from('pantry_items')
    .insert([row])
    .select()
    .single();
  if (error) {
    // 23505 = unique violation; treat as silent skip
    if (error.code !== '23505') console.error('addPantryItem:', error);
    return null;
  }
  return data as PantryItem;
}

/** Bulk-add from newline-separated text; returns how many were inserted. */
export async function bulkAddPantryItems(text: string): Promise<number> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 0;

  const uid = await currentUserId();
  const rows = lines
    .map((line) => {
      const base: Record<string, unknown> = { display_name: line, canonical_key: canonicaliseIngredient(line) };
      if (uid) base.user_id = uid;
      return base;
    })
    .filter((r) => r.canonical_key);

  if (!rows.length) return 0;

  // OM14 Phase B — the pantry is shared, so the dedupe key is the household,
  // not the user: otherwise Max and Bron each end up with their own "onion".
  // One target for both cases — an anonymous row has household_id NULL, and
  // NULLs never collide in a unique index, so the upsert simply inserts. (The
  // old anonymous target 'canonical_key' had been dangling since 010 dropped
  // that constraint, which made anonymous bulk-add fail with a 42P10.)
  const onConflict = 'household_id,canonical_key';
  const { error, count } = await supabase
    .from('pantry_items')
    .upsert(rows, { onConflict, ignoreDuplicates: true, count: 'exact' });
  if (error) {
    console.error('bulkAddPantryItems:', error);
    return 0;
  }
  return count ?? rows.length;
}

export async function removePantryItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) { console.error('removePantryItem:', error); return false; }
  return true;
}

/** Build a Set of canonical keys for fast membership checks. */
export function pantryKeySet(items: PantryItem[]): Set<string> {
  return new Set(items.map((i) => i.canonical_key));
}

/**
 * Canonical keys for every line of a recipe's ingredients string.
 * Skips empty lines and ingredients that canonicalise to "".
 */
export function recipeIngredientKeys(ingredients: string | undefined | null): string[] {
  if (!ingredients) return [];
  const lines = ingredients.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map(canonicaliseIngredient).filter((k) => k !== '');
}

/** True if every recipe ingredient is present in the pantry. */
export function isCookableNow(ingredients: string | undefined | null, pantryKeys: Set<string>): boolean {
  const keys = recipeIngredientKeys(ingredients);
  if (!keys.length) return false;
  return keys.every((k) => pantryKeys.has(k));
}
