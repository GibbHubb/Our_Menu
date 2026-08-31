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
  /** OM42 — kitchen | bathroom | household. Only kitchen counts as cookable. */
  category: PantryCategory;
}

export type PantryCategory = 'kitchen' | 'bathroom' | 'household';

export const PANTRY_SECTIONS: Array<{ key: PantryCategory; label: string; hint: string }> = [
  // OM49 review finding 8 — this used to say these rows are "what Cookable now
  // checks against". Cookable now is gone: the pantry no longer records what
  // you have, it is the half of a shop that is not a recipe.
  { key: 'kitchen',   label: 'Kitchen',   hint: 'Food and cooking staples — tick what you need and it goes on the list.' },
  { key: 'bathroom',  label: 'Bathroom',  hint: 'Toothpaste, shampoo, loo roll.' },
  { key: 'household', label: 'Household', hint: 'Washing powder, bin bags, cleaning.' },
];

/**
 * OM42 — the things you buy again and again. Offered as a one-click import so
 * a new pantry isn't 40 rounds of typing. Adding is idempotent: a canonical key
 * that already exists is skipped, so pressing it twice changes nothing.
 */
export const COMMON_STAPLES: Record<PantryCategory, string[]> = {
  kitchen: [
    'Olive oil', 'Vegetable oil', 'Salt', 'Black pepper', 'Plain flour', 'Sugar',
    'Rice', 'Pasta', 'Tinned tomatoes', 'Onions', 'Garlic', 'Butter', 'Milk',
    'Eggs', 'Stock cubes', 'Soy sauce', 'Vinegar', 'Honey', 'Oats', 'Coffee',
    'Tea', 'Baking powder', 'Cornflour', 'Mustard', 'Mayonnaise', 'Tomato paste',
  ],
  bathroom: [
    'Toothpaste', 'Toothbrush heads', 'Shampoo', 'Conditioner', 'Shower gel',
    'Deodorant', 'Toilet paper', 'Hand soap', 'Razors', 'Floss', 'Moisturiser',
  ],
  household: [
    'Washing powder', 'Fabric softener', 'Dishwasher tablets', 'Washing-up liquid',
    'Bin bags', 'Kitchen roll', 'Sponges', 'Surface cleaner', 'Bleach',
    'Tin foil', 'Cling film', 'Batteries', 'Light bulbs',
  ],
};

/**
 * OM49 — `setPantryNeeded` was here, and is gone.
 *
 * `pantry_items.needed` was the pantry holding an opinion that outlived the
 * shop it came from: the screen opened wearing last week's decisions, and a row
 * flagged before OM49 had no off switch left once the UI that set it went away
 * (review finding 1). A tick is local to one walk down the pantry now, and what
 * you pick is COPIED onto the list.
 *
 * The column stays in the database on purpose — dropping it is a follow-up, so
 * there is a way back if this model turns out to be wrong.
 */

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
export async function addPantryItem(
  displayName: string,
  category: PantryCategory = 'kitchen',
): Promise<PantryItem | null> {
  const key = canonicaliseIngredient(displayName);
  if (!key) return null;
  const uid = await currentUserId();
  const row = uid
    ? { canonical_key: key, display_name: displayName.trim(), category, user_id: uid }
    : { canonical_key: key, display_name: displayName.trim(), category };
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

/**
 * OM49 — `isCookableNow` and `pantryKeySet` were here, along with
 * `usePantry.ts`, and are gone with the "Cookable now" filter they served.
 * They answered "what can I cook from what's in the cupboard", which needs the
 * pantry to be a record of what you have — the premise this ticket dropped.
 */


/** OM42 — move an item between sections. */
export async function setPantryCategory(id: string, category: PantryCategory): Promise<void> {
  const { error } = await supabase.from('pantry_items').update({ category }).eq('id', id);
  if (error) console.error('setPantryCategory:', error);
}

/**
 * OM42 — import the common staples for one section. Returns how many were
 * actually new; duplicates are skipped by the canonical-key unique index, so
 * this is safe to run against a pantry that is already half full.
 */
export async function importCommonStaples(category: PantryCategory): Promise<number> {
  let added = 0;
  for (const name of COMMON_STAPLES[category]) {
    const row = await addPantryItem(name, category);
    if (row) added++;
  }
  return added;
}
