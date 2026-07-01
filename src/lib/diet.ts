// OM30 — diet tag helpers. Owner-set only (no inference / NLP). A recipe's
// `diet` array lists the diets it satisfies; empty means "untagged" — NOT
// asserted safe for any diet — so an active diet filter excludes empty-diet
// recipes. Mirrors the OM13 season helpers (seasons.ts).

export type Diet = 'vegetarian' | 'vegan' | 'gluten-free' | 'dairy-free';

export const DIETS: Diet[] = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'];

export const DIET_LABEL: Record<Diet, string> = {
  'vegetarian':  'Vegetarian 🥕',
  'vegan':       'Vegan 🌱',
  'gluten-free': 'Gluten-free 🌾',
  'dairy-free':  'Dairy-free 🥛',
};

/**
 * Single source of diet-match logic shared by the DecisionMaker and the main
 * filter bar so the two flows can't drift.
 *
 * - No selection → no filter active → always true (caller shows everything).
 * - Recipe has an empty diet array → never matches an active selection
 *   (it is not asserted safe for any diet).
 * - Otherwise true when the recipe's diets intersect the selected diets.
 */
export function dietMatches(
  recipeDiet: string[] | undefined | null,
  selected: string[],
): boolean {
  if (!selected || selected.length === 0) return true;       // no filter active
  if (!recipeDiet || recipeDiet.length === 0) return false;  // untagged → excluded
  return selected.some((d) => recipeDiet.includes(d));
}
