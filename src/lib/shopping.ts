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
import { setPantryNeeded } from './pantry';

/**
 * OM46 — one tick store for all three kinds of thing on the list.
 *
 * `shopping_ticks` was built for the computed ingredient lines, which have no
 * row id of their own. Staples and hand-typed extras DO have ids, but routing
 * them through the same table buys two things: a single definition of "ticked"
 * for the whole page, and a single clock — `updated_at` — for the hour of
 * inactivity that ends a trip. A staples-only shop has to be able to finish
 * itself too.
 */
export const pantryTickKey = (id: string) => `pantry:${id}`;
export const extraTickKey  = (id: string) => `extra:${id}`;

/** OM46 — leave the list alone for this long and the trip closes itself. */
export const AUTO_FINISH_MS = 60 * 60 * 1000;

/**
 * OM46 — "the list changed". The nav badge lives in a different component tree
 * from the list, and only refetched on a route change, so ticking something off
 * left the tab still claiming you had 17 things to buy. Same pattern the unit
 * toggle already uses (`om27-unit-system-changed`).
 */
export const LIST_CHANGED_EVENT = 'om46-shopping-list-changed';

export function announceListChanged(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIST_CHANGED_EVENT));
}

/**
 * OM46 — the shop's clock, not the phone's.
 *
 * The auto-finish compares "when was this list last touched" against "now", and
 * both used to come from the device. Two phones share this list, so a handset
 * whose clock is an hour fast would finish a trip the moment the other one
 * ticked something. Supabase stamps every HTTP response with a `Date` header,
 * so one HEAD gives us the offset and every comparison afterwards is in server
 * time. Falls back to the local clock if the probe fails — an unreachable
 * network is not a reason to break ticking.
 */
let clockSkewMs: number | null = null;

export async function syncServerClock(): Promise<void> {
    if (clockSkewMs !== null) return;
    try {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!base) { clockSkewMs = 0; return; }
        const before = Date.now();
        const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/`, { method: 'HEAD' });
        const header = res.headers.get('date');
        if (!header) { clockSkewMs = 0; return; }
        const server = new Date(header).getTime();
        if (Number.isNaN(server)) { clockSkewMs = 0; return; }
        // Charge half the round trip to the response leg.
        clockSkewMs = server - (before + (Date.now() - before) / 2);
    } catch {
        clockSkewMs = 0;
    }
}

/** Now, in server time where we know it. */
export function serverNow(): number {
    return Date.now() + (clockSkewMs ?? 0);
}

/**
 * OM41 — the key two lines must share to become one line on the list.
 *
 * `canonicaliseIngredient` already drops quantities, units, prep notes and
 * anything after a comma. What it keeps is the alternative: "spaghetti or
 * other pasta, long or short" and plain "spaghetti" stayed two entries on the
 * same shopping list. A recipe writer offering you a choice is still one thing
 * to buy, so cut at the choice and keep the first option.
 */
export function shoppingKey(name: string): string {
    const head = name
        .split(/\bor\b/i)[0]   // word boundaries matter: a bare /or/ turns "coriander" into "c"
        .split('/')[0]                  // "cilantro/coriander"       -> "cilantro"
        .split(',')[0];
    return canonicaliseIngredient(head) || canonicaliseIngredient(name) || name.trim().toLowerCase();
}
import { parseIngredient, scale, aggregate, type ShoppingLine } from './quantity';

export interface BasketRow {
    id: string;
    recipe_id: string;
    servings: number;
    /** OM42 — canonical keys the user unticked when adding the dish. */
    excluded?: string[] | null;
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
        .select('id, recipe_id, servings, excluded, recipes(id, title, image_url, ingredients, servings)')
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
export async function addToBasket(
    recipeId: string,
    servings: number,
    excluded: string[] = [],
): Promise<boolean> {
    const { error } = await supabase
        .from('meal_basket')
        .upsert({ recipe_id: recipeId, servings, excluded }, { onConflict: 'household_id,recipe_id' });
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

/**
 * OM46 — replace a dish's excluded keys.
 *
 * `excluded` started life (OM42) as "ingredients I unticked when adding this
 * dish". Finishing a shop writes into the same column, because a thing you
 * have already bought and a thing you never wanted are the same instruction to
 * the list: keep it off. Recording it on the basket row rather than globally is
 * what stops the dish you add next week arriving pre-ticked.
 */
export async function setBasketExcluded(id: string, excluded: string[]): Promise<boolean> {
    const { error } = await supabase.from('meal_basket').update({ excluded }).eq('id', id);
    if (error) { console.error('setBasketExcluded:', error); return false; }
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

export async function removeExtra(id: string): Promise<boolean> {
    const { error } = await supabase.from('shopping_extras').delete().eq('id', id);
    if (error) { console.error('removeExtra:', error); return false; }
    return true;
}

// ── ticks ───────────────────────────────────────────────────────────────────

export interface TickState {
    keys: Set<string>;
    /**
     * OM46 — when the list was last touched. A trip that has been sitting
     * untouched for AUTO_FINISH_MS is over, whether or not anyone pressed the
     * button. Null means no trip is in progress, and a list nobody has started
     * must never auto-finish — otherwise a basket left alone over a weekend
     * would quietly empty itself.
     */
    lastAt: Date | null;
}

export async function getTicks(): Promise<TickState> {
    const { data, error } = await supabase
        .from('shopping_ticks')
        .select('line_key, checked, updated_at');
    if (error) { console.error('getTicks:', error); return { keys: new Set(), lastAt: null }; }

    // The clock comes from EVERY row, not just the ticked ones: unticking
    // something is activity too, and it leaves a row with checked=false and a
    // fresh `updated_at`. Reading the clock off ticked rows only meant a shopper
    // who corrected a mis-tap could look an hour idle seconds later.
    let lastAt: Date | null = null;
    for (const r of data ?? []) {
        const at = new Date(r.updated_at as string);
        if (!Number.isNaN(at.getTime()) && (lastAt === null || at > lastAt)) lastAt = at;
    }
    const keys = new Set((data ?? []).filter((r) => r.checked).map((r) => r.line_key as string));
    return { keys, lastAt };
}

export async function setTick(lineKey: string, checked: boolean): Promise<void> {
    const { error } = await supabase
        .from('shopping_ticks')
        .upsert({ line_key: lineKey, checked, updated_at: new Date(serverNow()).toISOString() },
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

/**
 * The lines of a recipe that are actually things you buy.
 *
 * Extracted from `buildList` for OM46 so that "which keys does this dish still
 * contribute?" and "what does the list show?" cannot answer differently — a
 * dish counted as fully bought against one rule and rendered against another
 * would either strand a dish forever or delete one you still needed.
 */
export function usableIngredientLines(ingredients: string): string[] {
    return ingredients
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        // Drop section headings ("For the sauce:") — they are not shopping.
        .filter((l) => !/^[-*•\s]*[^:]{0,40}:$/.test(l))
        // …and things nobody buys. "1.5 pasta cooking water" on a shopping
        // list is noise that makes the real lines harder to scan.
        .filter((l) => !NOT_SHOPPING.test(l));
}

/** The canonical keys one basket row still contributes to the list. */
export function dishLineKeys(row: BasketRow): string[] {
    const recipe = row.recipes;
    if (!recipe?.ingredients) return [];
    const excluded = new Set(row.excluded ?? []);
    const keys: string[] = [];
    for (const line of usableIngredientLines(recipe.ingredients)) {
        const key = shoppingKey(parseIngredient(line).item || line);
        if (excluded.has(key) || excluded.has(canonicaliseIngredient(line))) continue;
        keys.push(key);
    }
    return Array.from(new Set(keys));
}

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

        const lines = usableIngredientLines(recipe.ingredients);

        // OM42 — what the user unticked on the recipe page stays off the list.
        const excluded = new Set(row.excluded ?? []);

        let parsedAny = false;
        for (const line of lines) {
            const parsed = scale(parseIngredient(line), factor);
            const key = shoppingKey(parsed.item || line);
            if (excluded.has(key) || excluded.has(canonicaliseIngredient(line))) continue;
            if (parsed.qty !== null) parsedAny = true;
            entries.push({ parsed, source: recipe.title, key });
        }
        if (lines.length && !parsedAny) unscalable.push(recipe.title);
    }

    const lines = aggregate(entries).sort((a, b) => a.item.localeCompare(b.item));
    return { lines, unscalable };
}

/** Stable key for tick state — survives servings changes and re-aggregation. */
export function lineKey(line: ShoppingLine): string {
    return shoppingKey(line.item);
}

// ── finishing the shop ──────────────────────────────────────────────────────

export interface TripResult {
    /** Distinct things marked bought. */
    bought: number;
    /** Dishes with nothing left to buy. They STAY on the list — see below. */
    dishesDone: string[];
    /** Staples put back to "we have this". */
    staplesRestocked: number;
    /** Hand-typed extras deleted. */
    extrasCleared: number;
    /**
     * A write failed. The ticks are deliberately left alone when this is set, so
     * nothing is reported bought that was not actually recorded.
     */
    failed: boolean;
}

/**
 * OM46 — close the shopping trip.
 *
 * Max, 2026-08-26: "at the end of the shop either a finished shopping button,
 * or if it is left more than an hour — all the items on the shopping list are
 * considered bought." His call on the scope: **only the ticked items**. Whatever
 * you did not tick is left exactly where it was, so the button is safe to press
 * halfway round the shop and the hour-long timeout can never throw away
 * something you still need.
 *
 * Each kind of item records "bought" in the place that makes it stay bought:
 *
 *   ingredients  -> the dish's `excluded` keys (they are computed lines with no
 *                   row of their own, so the dish is the only durable home)
 *   staples      -> `pantry_items.needed = false` — you bought the milk, so the
 *                   pantry is no longer low on it
 *   extras       -> the row is deleted; a hand-typed one-off is finished with
 *
 * ⚠️ A dish is NEVER removed from the basket here, even when every one of its
 * ingredients has been bought. The list aggregates identical ingredients across
 * dishes, so ticking "butter" for the cake also satisfies the last outstanding
 * line of a curry you have not shopped for — and an hour-long timeout that can
 * silently delete a meal you planned is not a feature. The dish stays, showing
 * that there is nothing left to buy for it, and you remove it yourself.
 *
 * Ticks are cleared only once every write has succeeded: clearing them after a
 * partial failure would report items bought that were never recorded anywhere.
 */
export async function finishTrip(
    basket: BasketRow[],
    neededIds: string[],
    extraIds: string[],
    ticks: Set<string>,
): Promise<TripResult> {
    const boughtKeys = new Set<string>();
    const dishesDone: string[] = [];
    let failed = false;

    // ── ingredients ──────────────────────────────────────────────────────
    for (const row of basket) {
        const keys = dishLineKeys(row);
        const got = keys.filter((k) => ticks.has(k));
        if (!got.length) continue;

        const ok = await setBasketExcluded(
            row.id, Array.from(new Set([...(row.excluded ?? []), ...got])));
        if (!ok) { failed = true; continue; }

        got.forEach((k) => boughtKeys.add(k));
        if (got.length === keys.length) dishesDone.push(row.recipes?.title ?? 'Dish');
    }

    // ── staples ──────────────────────────────────────────────────────────
    let staplesRestocked = 0;
    for (const id of neededIds) {
        if (!ticks.has(pantryTickKey(id))) continue;
        if (!await setPantryNeeded(id, false)) { failed = true; continue; }
        boughtKeys.add(pantryTickKey(id));
        staplesRestocked++;
    }

    // ── extras ───────────────────────────────────────────────────────────
    let extrasCleared = 0;
    for (const id of extraIds) {
        if (!ticks.has(extraTickKey(id))) continue;
        if (!await removeExtra(id)) { failed = true; continue; }
        boughtKeys.add(extraTickKey(id));
        extrasCleared++;
    }

    // Only now is every tick recorded somewhere durable. On a partial failure
    // the board is left exactly as it was, so the shopper can press the button
    // again rather than lose what they had ticked.
    if (!failed) await clearTicks();

    return { bought: boughtKeys.size, dishesDone, staplesRestocked, extrasCleared, failed };
}

/**
 * Has this trip been abandoned long enough to count as finished?
 *
 * Guarded on there being a tick at all: an untouched list is not a trip in
 * progress, and must survive being ignored for a week. `now` defaults to server
 * time so a phone with a wrong clock cannot end someone else's shop.
 */
export function tripIsStale(lastAt: Date | null, ticks: Set<string>, now = serverNow()): boolean {
    if (!lastAt || ticks.size === 0) return false;
    return now - lastAt.getTime() > AUTO_FINISH_MS;
}
