// OM31 — ingredient density table for cross-dimension (volume ↔ mass) display
// conversion. Keyed by the SAME canonical key `canonicaliseIngredient` already
// produces for pantry matching, so there is one normaliser, not two dialects.
//
// Values are grams per millilitre (g/ml). They are documented approximations
// for display help — NOT a precision scale. Each entry notes the assumption.
// Anything not in this table returns null and the converter passes the value
// through unchanged (never shows a wrong number).

import { canonicaliseIngredient } from './ingredients';

// g per ml. Sources are common cooking references (King Arthur / USDA-ish),
// picking one documented value per ingredient.
const DENSITY_G_PER_ML: Record<string, number> = {
  // Dry goods (volume-measured in US recipes, mass-measured in metric).
  'flour':        0.53,  // all-purpose, spooned & levelled (~125 g/cup)
  'sugar':        0.85,  // white granulated (~200 g/cup)
  'brown sugar':  0.93,  // packed (~220 g/cup)
  'rice':         0.80,  // uncooked long-grain (~190 g/cup)
  'salt':         1.20,  // fine table salt (~288 g/cup)
  // Fats / liquids.
  'butter':       0.96,  // softened (~227 g/cup)
  'water':        1.00,  // reference
  'milk':         1.03,  // whole milk
  'oil':          0.92,  // neutral cooking oil (~218 g/cup)
  'olive oil':    0.92,  // ~same as neutral oil for display purposes
  'honey':        1.42,  // (~340 g/cup)
};

/**
 * Look up an ingredient's density (g/ml) by its canonical name. Returns the
 * match or null when the ingredient is unknown — callers must treat null as
 * "do not cross-convert". Reuses `canonicaliseIngredient` so "200g plain
 * flour", "Flour", and "flour" all resolve to the same entry.
 */
export function lookupDensity(ingredientName: string | null | undefined): number | null {
  if (!ingredientName) return null;
  const key = canonicaliseIngredient(ingredientName);
  if (!key) return null;
  return DENSITY_G_PER_ML[key] ?? null;
}
