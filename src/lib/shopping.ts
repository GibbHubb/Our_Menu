/**
 * OM40 — the shopping list: what to buy for the dishes you picked.
 *
 * Three inputs, one list:
 *   meal_basket      dishes + how many you're feeding  -> scaled ingredients
 *   pantry_items     rows flagged `needed`             -> Staples
 *   shopping_extras  hand-typed                        -> Staples
 *
 * Tick state lives in `shopping_ticks`, keyed by the ingredient's canonical
 * name rather than by row id, so ticking "500 g beef" off and then changing
 * the servings doesn't silently untick it — you'd be standing in the shop
 * wondering whether you already grabbed it.
 */

import { supabase } from './supabaseClient';
import { canonicaliseIngredient } from './ingredients';
import { parseIngredient, scale, aggregate, type ShoppingLine } from './quantity';

export interface BasketRow {
    id: string;
    recipe_id: string;
    servings: number;
    recipes: {
        id: string;
        title: string;
        image_url: string | null;
        ingredients: string | null;
        servings: number | null;
    } | null;
}

export interface ExtraRow {
    id: string;
    label: string;
    checked: boolean;
}

// ── basket ──────────────────────────────────────────────────────────────────

export async function getBasket(): Promise<BasketRow[]> {
    const { data, error } = await supabase
        .from('meal_basket')
        .select('id, recipe_id, servings, recipes(id, title, image_url, ingredients, servings)')
        .order('created_at');
    if (error) { console.error('getBasket:', error); return []; }
    // PostgREST widens a to-one embed to an array in the generated types.
    return (data ?? []).map((r) => {
        const rec = (r as unknown as { recipes: BasketRow['recipes'] | BasketRow['recipes'][] }).recipes;
        return { ...(r as unknown as BasketRow), recipes: Array.isArray(rec) ? rec[0] ?? null : rec };
    });
}

/**
 * Add a dish. Adding one that's already there adjusts its servings instead of
 * creating a second row — the unique index in 020 enforces the same thing at
 * the DB, so a double-click can't produce two entries to reconcile.
 */
export async function addToBasket(recipeId: string, servings: number): Promise<boolean> {
    const { error } = await supabase
        .from('meal_basket')
        .upsert({ recipe_id: recipeId, servings }, { onConflict: 'household_id,recipe_id' });
    if (error) { console.error('addToBasket:', error); return false; }
    return true;
}

export async function setBasketServings(id: string, servings: number): Promise<boolean> {
    const { error } = await supabase.from('meal_basket').update({ servings }).eq('id', id);
    if (error) { console.error('setBasketServings:', error); return false; }
    return true;
}

export async function removeFromBasket(id: string): Promise<boolean> {
    const { error } = await supabase.from('meal_basket').delete().eq('id', id);
    if (error) { console.error('removeFromBasket:', error); return false; }
    return true;
}

// ── extras ──────────────────────────────────────────────────────────────────

export async function getExtras(): Promise<ExtraRow[]> {
    const { data, error } = await supabase
        .from('shopping_extras')
        .select('id, label, checked')
        .order('created_at');
    if (error) { console.error('getExtras:', error); return []; }
    return (data ?? []) as ExtraRow[];
}

export async function addExtra(label: string): Promise<ExtraRow | null> {
    const clean = label.trim();
    if (!clean) return null;
    const { data, error } = await supabase
        .from('shopping_extras')
        .insert([{ label: clean }])
        .select('id, label, checked')
        .single();
    if (error) { console.error('addExtra:', error); return null; }
    return data as ExtraRow;
}

export async function setExtraChecked(id: string, checked: boolean): Promise<void> {
    const { error } = await supabase.from('shopping_extras').update({ checked }).eq('id', id);
    if (error) console.error('setExtraChecked:', error);
}

export async function removeExtra(id: string): Promise<void> {
    const { error } = await supabase.from('shopping_extras').delete().eq('id', id);
    if (error) console.error('removeExtra:', error);
}

// ── ticks ───────────────────────────────────────────────────────────────────

export async function getTicks(): Promise<Set<string>> {
    const { data, error } = await supabase.from('shopping_ticks').select('line_key, checked');
    if (error) { console.error('getTicks:', error); return new Set(); }
    return new Set((data ?? []).filter((r) => r.checked).map((r) => r.line_key as string));
}

export async function setTick(lineKey: string, checked: boolean): Promise<void> {
    const { error } = await supabase
        .from('shopping_ticks')
        .upsert({ line_key: lineKey, checked, updated_at: new Date().toISOString() },
                { onConflict: 'household_id,line_key' });
    if (error) console.error('setTick:', error);
}

/** Clear every tick — "we've done the shop". */
export async function clearTicks(): Promise<void> {
    const { error } = await supabase.from('shopping_ticks').delete().neq('line_key', '');
    if (error) console.error('clearTicks:', error);
}

// ── the list itself ─────────────────────────────────────────────────────────

/**
 * Ingredient lines that are instructions in disguise. Kept deliberately short —
 * over-filtering silently drops something you needed to buy, which is far worse
 * than a slightly odd line on the list.
 */
const NOT_SHOPPING = /^[-*•\s\d.,/½¼¾]*(cups?|cup of|ml|litres?)?\s*(pasta |starchy |reserved )?(cooking )?water\b|^[-*•\s]*ice\b|^[-*•\s]*water\b/i;

export interface BuiltList {
    lines: ShoppingLine[];
    /** Dishes whose ingredients carry no usable quantities at all. */
    unscalable: string[];
}

/**
 * Turn the basket into one aggregated list.
 *
 * A recipe with no base serving count scales ×1 — never a guess. A recipe
 * whose lines don't parse still contributes them, verbatim and unscaled, and
 * is named in `unscalable` so the page can say why rather than quietly showing
 * a short list.
 */
export function buildList(basket: BasketRow[]): BuiltList {
    const entries: Array<{ parsed: ReturnType<typeof parseIngredient>; source: string; key: string }> = [];
    const unscalable: string[] = [];

    for (const row of basket) {
        const recipe = row.recipes;
        if (!recipe?.ingredients) continue;

        const base = recipe.servings && recipe.servings > 0 ? recipe.servings : null;
        const factor = base ? row.servings / base : 1;

        const lines = recipe.ingredients
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            // Drop section headings ("For the sauce:") — they are not shopping.
            .filter((l) => !/^[-*•\s]*[^:]{0,40}:$/.test(l))
            // …and things nobody buys. "1.5 pasta cooking water" on a shopping
            // list is noise that makes the real lines harder to scan.
            .filter((l) => !NOT_SHOPPING.test(l));

        let parsedAny = false;
        for (const line of lines) {
            const parsed = scale(parseIngredient(line), factor);
            if (parsed.qty !== null) parsedAny = true;
            const key = canonicaliseIngredient(parsed.item) || parsed.item || line.toLowerCase();
            entries.push({ parsed, source: recipe.title, key });
        }
        if (lines.length && !parsedAny) unscalable.push(recipe.title);
    }

    const lines = aggregate(entries).sort((a, b) => a.item.localeCompare(b.item));
    return { lines, unscalable };
}

/** Stable key for tick state — survives servings changes and re-aggregation. */
export function lineKey(line: ShoppingLine): string {
    return canonicaliseIngredient(line.item) || line.item;
}
