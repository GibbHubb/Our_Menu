// OM74 — flash-lite sometimes answers a meal plan day with the meal TYPE ("Lunch") in `meal` where a
// dish name belongs. The prompt now says not to; this catches the ones that slip through anyway.

/** Words that name a meal slot, not a dish. Compared case-insensitively against the whole `meal` value. */
export const MEAL_TYPE_WORDS = [
    'breakfast', 'brunch', 'lunch', 'dinner', 'supper', 'tea', 'snack', 'snacks', 'dessert', 'meal', 'main', 'mains',
] as const;

/** What a day shows when the model gave only a meal type and no library recipe either. */
export const FALLBACK_MEAL_NAME = "Chef's choice";

const MEAL_TYPES = new Set<string>(MEAL_TYPE_WORDS);

/** True when `value` is a meal-type word (or empty) rather than a dish name. */
export function isMealTypeWord(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    const v = value.trim().toLowerCase().replace(/[.!:]+$/, '');
    return v === '' || MEAL_TYPES.has(v);
}

/**
 * Replace a `meal` that is only a meal type: with the day's `recipe_title` when it has one (that is the
 * dish the model meant), otherwise with FALLBACK_MEAL_NAME. Days are never dropped, so the plan keeps
 * the length that was asked for.
 */
export function fixMealNames<T extends { meal?: unknown; recipe_title?: unknown }>(days: T[]): T[] {
    return days.map((d) => {
        if (!isMealTypeWord(d.meal)) return d;
        const title = typeof d.recipe_title === 'string' && !isMealTypeWord(d.recipe_title) ? d.recipe_title.trim() : null;
        return { ...d, meal: title ?? FALLBACK_MEAL_NAME };
    });
}
