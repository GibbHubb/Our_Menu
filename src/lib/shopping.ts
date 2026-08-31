/**
 * OM49 — the shopping list: the things you decided to buy.
 *
 * One table, `shopping_extras`, holding plain rows. A row gets there one of
 * three ways — ticked on a recipe, ticked in the pantry, or typed in — and once
 * it is there it no longer remembers which. That is the whole change from OM40:
 *
 *   before   list = buildList(meal_basket) minus `excluded` minus the pantry
 *   now      list = the rows you put on it
 *
 * The old shape was a live projection, so nothing on screen was a thing you
 * could point at. Removing one ingredient meant either removing the whole dish
 * or storing a per-dish exclusion, and "Checked out" would have had to unwind a
 * basket rather than empty a list. Max + Bron, 2026-08-27: "we are no longer
 * treating this like a pantry tracker... we decide what we need for the meal,
 * then the house, then make sure we bought it at the shops, then reset."
 *
 * Merging is the one piece of real logic and it lives at copy time: 2 cans +
 * 1 can = 3 cans, while 200 g + 1 can stays two lines, because a made-up
 * g<->can conversion in front of someone in a shop is worse than two lines.
 *
 * Tick state stays in `shopping_ticks` (OM46), keyed by row id, so the page,
 * the nav badge and the auto-finish all read one definition of "in the basket".
 */

import { supabase } from './supabaseClient';
import { canonicaliseIngredient } from './ingredients';
import {
    parseIngredient, scale, toBaseAmount, formatAmount,
    type ParsedIngredient, type UnitFamily,
} from './quantity';

/**
 * OM46 — one tick store for everything on the list.
 *
 * `shopping_ticks` was built for the computed ingredient lines, which had no
 * row id of their own. Every line has one now, but the table stays: it is also
 * the single clock — `updated_at` — that the inactivity timeout runs off.
 */
// (`pantryTickKey` lived here too, for the Staples section that OM49 removed —
// the pantry's ticks are local to one walk down it now and never reach the DB.)
export const extraTickKey = (id: string) => `extra:${id}`;

/**
 * Leave the list alone for this long and the trip closes itself.
 *
 * OM46 set an hour; Max cut it to 15 minutes for OM49, on the reasoning that
 * the walk home from the shop is the moment nobody remembers to press the
 * button. It can only ever remove things you have TICKED — what you did not
 * tick is untouched — so the worst case is a list that closed while you were
 * standing in a queue, and the summary that appears says so and names the count.
 */
export const AUTO_FINISH_MS = 15 * 60 * 1000;

/**
 * OM46 — "the list changed". The nav badge lives in a different component tree
 * from the list and only refetched on a route change, so ticking something off
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
 * whose clock is 20 minutes fast would end a trip the other one is still
 * shopping. One `server_now()` call gives us the offset and every comparison
 * afterwards is in server time.
 *
 * Falls back to the local clock if the probe fails — an unreachable network is
 * not a reason to break ticking — but it does NOT remember the failure, so the
 * next page load tries again. The other half of the pair is in migration 024:
 * `shopping_ticks.updated_at` is now stamped by Postgres, so the value being
 * compared against is not a phone's opinion either.
 */
let clockSkewMs: number | null = null;

export async function syncServerClock(): Promise<void> {
    if (clockSkewMs !== null) return;
    try {
        const before = Date.now();
        // OM49 — was `res.headers.get('date')` on a HEAD of the REST root. A
        // browser cannot read that header: `Date` is not CORS-safelisted, so it
        // came back null on every call and the code quietly took its "network
        // failed" branch — skew 0, the device's own clock, which is exactly the
        // thing this function exists to stop trusting. It looked like it worked
        // because the fallback IS the old behaviour. `server_now()` (migration
        // 024) is an RPC, so the value comes back in the body where we can see it.
        const { data, error } = await supabase.rpc('server_now');
        if (error || !data) return;                    // leave null: try again next load
        const server = new Date(data as string).getTime();
        if (Number.isNaN(server)) return;
        // Charge half the round trip to the response leg.
        clockSkewMs = server - (before + (Date.now() - before) / 2);
    } catch {
        // Deliberately does NOT cache 0. One blip used to disable the skew
        // correction for the life of the tab.
    }
}

/** Did we ever manage to read the server's clock? Reported, not assumed. */
export function serverClockKnown(): boolean {
    return clockSkewMs !== null;
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

// ── the list ────────────────────────────────────────────────────────────────

/**
 * One thing to buy.
 *
 * `label` is the bare name — the amount is rendered from `qty_base`, never
 * baked into the string, because a merge has to be able to change the number
 * without re-parsing text it already understood once.
 */
export interface ListRow {
    id: string;
    label: string;
    item_key: string;
    qty_base: number | null;
    family: UnitFamily | null;
    unit_hint: string | null;
}

const LIST_COLUMNS = 'id, label, item_key, qty_base, family, unit_hint';

/** "3 cans", "1.5 kg", "2 tbsp" — or null when the line carried no number. */
export function listAmount(row: ListRow): string | null {
    if (row.qty_base === null || !row.family) return null;
    return formatAmount(row.qty_base, row.family, row.unit_hint);
}

/** The whole line as one string, for the clipboard. */
export function listLineText(row: ListRow): string {
    const amount = listAmount(row);
    return amount ? `${amount} ${row.label}` : row.label;
}

function toListRow(r: Record<string, unknown>): ListRow {
    return {
        id: r.id as string,
        label: r.label as string,
        item_key: (r.item_key as string) ?? '',
        // PostgREST can hand `numeric` back as a string depending on the
        // driver; a string here would make the next merge concatenate.
        qty_base: r.qty_base === null || r.qty_base === undefined ? null : Number(r.qty_base),
        family: (r.family as UnitFamily | null) ?? null,
        unit_hint: (r.unit_hint as string | null) ?? null,
    };
}

export async function getList(): Promise<ListRow[]> {
    const { data, error } = await supabase
        .from('shopping_extras')
        .select(LIST_COLUMNS)
        .order('created_at');
    if (error) { console.error('getList:', error); return []; }
    return (data ?? []).map((r) => toListRow(r as Record<string, unknown>));
}

/** A line on its way to the list, already scaled to the servings you chose. */
export interface CopyLine {
    /** Display name — "tinned tomatoes". */
    item: string;
    /** Canonical merge key. */
    key: string;
    qty_base: number | null;
    family: UnitFamily | null;
    unit_hint: string | null;
}

/**
 * Turn a recipe line into something copyable, at the servings on screen.
 *
 * `fallback` is the name the UI is showing. A line the parser cannot make sense
 * of still goes on the list — verbatim, with no number — because a missing
 * ingredient is worse than an unscaled one.
 */
export function toCopyLine(raw: string, factor = 1, fallback = ''): CopyLine {
    const parsed: ParsedIngredient = scale(parseIngredient(raw), factor);
    const name = (parsed.item || fallback || raw).trim();
    // The same head-cut `shoppingKey` makes, so the NAME on the list matches the
    // key it merged under: "1 onion, chopped" is a line about onions, and
    // "onion, chopped" is a prep note you cannot buy.
    const item = name.split(/\bor\b/i)[0].split('/')[0].split(',')[0].trim() || name;
    const qtyBase = toBaseAmount(parsed);
    return {
        item,
        key: shoppingKey(item || raw),
        qty_base: qtyBase,
        // No number means no family and no unit: "salt and pepper" is not 0 g
        // of salt, and it must not merge with "20 g salt" either.
        family: qtyBase === null ? null : (parsed.family ?? 'count'),
        unit_hint: qtyBase === null ? null : parsed.unit,
    };
}

export interface CopyResult {
    /** New rows on the list. */
    added: number;
    /** Rows whose amount grew because the thing was already on it. */
    merged: number;
    /** Lines that did not make it — the caller must not report those as added. */
    failed: number;
}

/**
 * The bucket two lines must share to become one line.
 *
 * Family alone is not enough: `can`, `clove`, `bunch` and `packet` are all
 * family `count` with base 1, so keying on the family would add "2 cans tinned
 * tomatoes" to "3 tinned tomatoes" and show **5 cans** — the same
 * wrong-number-in-a-shop the cross-family rule exists to prevent, one level
 * down. Counted things merge only when the counted noun matches.
 *
 * Mass and volume are deliberately exempt: their conversion is exact, so
 * 500 g + 1 kg really is 1500 g and merging them is right.
 *
 * ⚠️ The unique index in migration 023 is keyed the same way. Change one and
 * you must change the other, or an insert starts failing at the database.
 */
const mergeKey = (key: string, family: UnitFamily | null, unitHint: string | null) =>
    `${key}|${family ?? ''}|${family === 'count' ? (unitHint ?? '') : ''}`;

/**
 * Copy ticked lines onto the list, merging by ingredient AND unit family.
 *
 * Max, 2026-08-27: "merge units and always try to include amounts — so 2 × cans
 * tinned tomatoes + 1 can from another recipe would be 3 × cans of tinned
 * tomatoes." Adding across families is deliberately NOT attempted: 200 g of
 * tomatoes and a tin of tomatoes are two different things to pick up, and a
 * single invented number would send you home without one of them.
 */
export async function copyLinesToList(lines: CopyLine[]): Promise<CopyResult> {
    // Fold the incoming batch together first, so one recipe listing an
    // ingredient twice arrives as one line rather than racing itself.
    const wanted = new Map<string, CopyLine>();
    for (const line of lines) {
        const item = line.item.trim();
        const key = line.key.trim();
        if (!item || !key) continue;
        const k = mergeKey(key, line.family, line.unit_hint);
        const prev = wanted.get(k);
        if (!prev) { wanted.set(k, { ...line, item, key }); continue; }
        prev.qty_base = prev.qty_base === null && line.qty_base === null
            ? null
            : (prev.qty_base ?? 0) + (line.qty_base ?? 0);
        prev.unit_hint = prev.unit_hint ?? line.unit_hint;
    }
    if (!wanted.size) return { added: 0, merged: 0, failed: 0 };

    const current = await getList();
    const index = new Map(current.map((r) => [mergeKey(r.item_key, r.family, r.unit_hint), r]));

    let added = 0, merged = 0, failed = 0;

    for (const [k, want] of wanted) {
        const existing = index.get(k);
        if (existing) {
            if (await mergeInto(existing, want)) merged++; else failed++;
            continue;
        }

        const { data, error } = await supabase
            .from('shopping_extras')
            .insert([{
                label: want.item,
                item_key: want.key,
                qty_base: want.qty_base,
                family: want.family,
                unit_hint: want.unit_hint,
            }])
            .select(LIST_COLUMNS)
            .single();

        if (error) {
            // 23505 — the other phone put the same thing on the list between
            // our read and our write. Merge into theirs rather than failing in
            // someone's face while they are standing in the shop.
            if (error.code === '23505') {
                const row = await findListRow(want.key, want.family, want.unit_hint);
                if (row && await mergeInto(row, want)) { merged++; continue; }
            }
            console.error('copyLinesToList:', error);
            failed++;
            continue;
        }
        added++;
        index.set(k, toListRow(data as Record<string, unknown>));
    }

    if (added || merged) announceListChanged();
    return { added, merged, failed };
}

/** Add `want`'s amount to a row already on the list. */
async function mergeInto(row: ListRow, want: CopyLine): Promise<boolean> {
    // A line with no number adds nothing but is not a failure: "salt and
    // pepper" is already on the list, and there is no amount to grow.
    const qty = want.qty_base === null
        ? row.qty_base
        : (row.qty_base ?? 0) + want.qty_base;
    const { error } = await supabase
        .from('shopping_extras')
        .update({ qty_base: qty, unit_hint: row.unit_hint ?? want.unit_hint })
        .eq('id', row.id);
    if (error) { console.error('copyLinesToList/merge:', error); return false; }
    return true;
}

async function findListRow(
    key: string, family: UnitFamily | null, unitHint: string | null,
): Promise<ListRow | null> {
    let q = supabase.from('shopping_extras').select(LIST_COLUMNS).eq('item_key', key);
    // PostgREST needs `is` for null — `eq` against null matches nothing.
    q = family === null ? q.is('family', null) : q.eq('family', family);
    // Counted things are bucketed by the counted noun as well (see mergeKey).
    if (family === 'count') q = unitHint === null ? q.is('unit_hint', null) : q.eq('unit_hint', unitHint);
    const { data, error } = await q.maybeSingle();
    if (error) { console.error('findListRow:', error); return null; }
    return data ? toListRow(data as Record<string, unknown>) : null;
}

/**
 * Type something onto the list by hand.
 *
 * Goes through the same merge as everything else (OM49 review finding 2):
 * ticking "Rice" in the pantry on two visits used to leave two rows, because
 * nothing compared them.
 */
export async function addExtra(label: string): Promise<CopyResult> {
    const clean = label.trim();
    if (!clean) return { added: 0, merged: 0, failed: 0 };
    // Parsed like any other line, so "2 L milk" typed by hand carries its
    // amount and merges with the milk a recipe put there. It used to be sent
    // with qty_base null, which made a merge a silent no-op: the row was
    // already on the list, nothing changed, and the caller was told `true`.
    return copyLinesToList([toCopyLine(clean)]);
}

export async function removeFromList(id: string): Promise<boolean> {
    const { error } = await supabase.from('shopping_extras').delete().eq('id', id);
    if (error) { console.error('removeFromList:', error); return false; }
    return true;
}

// ── ticks ───────────────────────────────────────────────────────────────────

export interface TickState {
    keys: Set<string>;
    /**
     * OM46 — when the list was last touched. A trip that has been sitting
     * untouched for AUTO_FINISH_MS is over, whether or not anyone pressed the
     * button. Null means no trip is in progress, and a list nobody has started
     * must never auto-finish — otherwise a list left alone over a weekend
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
    // who corrected a mis-tap could look 15 minutes idle seconds later.
    let lastAt: Date | null = null;
    for (const r of data ?? []) {
        const at = new Date(r.updated_at as string);
        if (!Number.isNaN(at.getTime()) && (lastAt === null || at > lastAt)) lastAt = at;
    }
    const keys = new Set((data ?? []).filter((r) => r.checked).map((r) => r.line_key as string));
    return { keys, lastAt };
}

export async function setTick(lineKey: string, checked: boolean): Promise<void> {
    // `updated_at` is deliberately NOT sent: migration 024 has Postgres stamp
    // it. The client used to write its own clock into the column the timeout
    // then measured, which made the whole server-clock exercise circular.
    const { error } = await supabase
        .from('shopping_ticks')
        .upsert({ line_key: lineKey, checked }, { onConflict: 'household_id,line_key' });
    if (error) console.error('setTick:', error);
}

/**
 * Clear ticks — every one, or only the named keys.
 *
 * Scoped by default at the call sites that finish a trip: wiping the whole
 * household's ticks would throw away what the OTHER shopper had just ticked on
 * their phone, mid-shop. "Untick everything" is the one caller that really
 * means all of them, and a person pressed it.
 */
export async function clearTicks(keys?: string[]): Promise<boolean> {
    if (keys && keys.length === 0) return true;
    const q = supabase.from('shopping_ticks').delete();
    const { error } = keys ? await q.in('line_key', keys) : await q.neq('line_key', '');
    if (error) { console.error('clearTicks:', error); return false; }
    return true;
}

// ── finishing the shop ──────────────────────────────────────────────────────

export interface TripResult {
    /** Things taken off the list because you bought them. */
    bought: number;
    /** Things left on it because you did not tick them. */
    remaining: number;
    /**
     * The delete failed. The ticks are deliberately left alone when this is
     * set, so nothing is reported bought that was not actually recorded.
     */
    failed: boolean;
    /**
     * An automatic finish that found the trip was NOT idle after all, and did
     * nothing. Someone else is still shopping.
     */
    skipped?: boolean;
}

/**
 * OM49 — "Checked out": the ticked things are bought, so they leave the list.
 *
 * Max, 2026-08-26/27: "either a finished shopping button, or if it is left more
 * than [15 minutes] — all the items on the shopping list are considered
 * bought", and "then we say checked out and it all resets". His call on the
 * scope, unchanged from OM46: **only the ticked items**. Whatever you did not
 * tick stays exactly where it was, so the button is safe to press halfway round
 * the shop and the timeout can never throw away something you still need.
 *
 * Under OM49 this is one delete rather than three different ways of recording
 * "bought" — that is the point of the list being copied rather than derived.
 *
 * ⚠️ It re-reads the list and the ticks rather than trusting what the page was
 * showing. Two people shop off this list at once: the caller's copy can be
 * minutes old, and deleting from it would take out a row whose amount grew
 * after the snapshot was taken. For the same reason an AUTOMATIC finish
 * re-checks idleness against the freshly-read clock — an idle tab must not end
 * a shop that the other handset is in the middle of.
 */
export async function finishTrip(auto = false): Promise<TripResult> {
    const [rows, tickState] = await Promise.all([getList(), getTicks()]);
    const ticks = tickState.keys;

    if (auto && !tripIsStale(tickState.lastAt, ticks)) {
        return { bought: 0, remaining: rows.length, failed: false, skipped: true };
    }

    const bought = rows.filter((r) => ticks.has(extraTickKey(r.id)));
    const remaining = rows.length - bought.length;

    if (!bought.length) {
        // Nothing ticked, or only ticks left over from rows somebody else
        // removed. Clear those so the timeout does not keep re-firing on a trip
        // with nothing in it.
        await clearTicks([...ticks]);
        return { bought: 0, remaining, failed: false };
    }

    const boughtKeys = bought.map((r) => extraTickKey(r.id));
    const { error } = await supabase
        .from('shopping_extras')
        .delete()
        .in('id', bought.map((r) => r.id));
    if (error) {
        console.error('finishTrip:', error);
        return { bought: 0, remaining: rows.length, failed: true };
    }

    // Only the ticks belonging to rows that are now gone. Clearing the lot
    // would discard whatever the other shopper has ticked since.
    await clearTicks(boughtKeys);
    return { bought: bought.length, remaining, failed: false };
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
