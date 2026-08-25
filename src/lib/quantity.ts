/**
 * OM40 — ingredient quantity parsing, scaling and aggregation.
 *
 * The shopping list stands or falls on this file: "how much do I buy for 6
 * people" is only answerable if a free-text line like
 *
 *     1 lb / 500g   beef steak ((rump and skirt are ideal) (Note 1))
 *
 * becomes { qty: 500, unit: 'g', item: 'beef steak' }. Every shape below was
 * taken from the recipes actually in the database, not imagined:
 *
 *   "2 tbsp lime juice"                    plain
 *   "1/2 tsp cumin powder"                 ascii fraction
 *   "1 1/2 cups flour"                     mixed number
 *   "½ cup coriander"                      vulgar fraction
 *   "2 - 3 garlic cloves"                  range (take the upper — you'd rather
 *                                          have one clove spare than be short)
 *   "1 lb / 500g beef steak"               dual units (prefer metric)
 *   "4 tbsp / 1/4 cup orange juice"        dual units, neither metric
 *   "Salt and pepper"                      no quantity at all
 *
 * A line we cannot parse is NEVER dropped — it goes on the list verbatim with
 * no number, because a missing ingredient is worse than an unscaled one.
 */

export type UnitFamily = "mass" | "volume" | "count";

export interface ParsedIngredient {
    /** Amount in the line's own unit. null when the line carries no number. */
    qty: number | null;
    /** Canonical unit token ('g', 'ml', 'tbsp', 'clove'…) or null. */
    unit: string | null;
    family: UnitFamily | null;
    /** The thing itself, lower-cased, notes stripped: "beef steak". */
    item: string;
    /** Parenthetical asides pulled out of the line, joined. */
    note: string;
    /** The original line, untouched. */
    raw: string;
}

// ── units ───────────────────────────────────────────────────────────────────
// `base` is how many of the family's base unit (g / ml / piece) one of these is.

interface UnitDef { canonical: string; family: UnitFamily; base: number }

const UNITS: Record<string, UnitDef> = {};
function unit(canonical: string, family: UnitFamily, base: number, ...aliases: string[]) {
    for (const a of [canonical, ...aliases]) UNITS[a] = { canonical, family, base };
}

unit("g", "mass", 1, "gr", "gram", "grams", "gramme", "grammes");
unit("kg", "mass", 1000, "kilo", "kilos", "kilogram", "kilograms");
unit("oz", "mass", 28.3495, "ounce", "ounces");
unit("lb", "mass", 453.592, "lbs", "pound", "pounds");

unit("ml", "volume", 1, "millilitre", "millilitres", "milliliter", "milliliters", "cc");
unit("l", "volume", 1000, "lt", "litre", "litres", "liter", "liters");
unit("tsp", "volume", 5, "teaspoon", "teaspoons", "t");
unit("tbsp", "volume", 15, "tablespoon", "tablespoons", "tbs", "tbl");
unit("cup", "volume", 240, "cups");

// Counted things. Base 1 each — they aggregate with each other only when the
// word matches, which `item` already guarantees.
unit("clove", "count", 1, "cloves");
unit("can", "count", 1, "cans", "tin", "tins");
unit("slice", "count", 1, "slices");
unit("sprig", "count", 1, "sprigs");
unit("stalk", "count", 1, "stalks", "stick", "sticks");
unit("bunch", "count", 1, "bunches");
unit("handful", "count", 1, "handfuls");
unit("pinch", "count", 1, "pinches");
unit("packet", "count", 1, "packets", "pack", "packs", "punnet", "punnets");

const VULGAR: Record<string, number> = {
    "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

/** "1 1/2" | "½" | "1.5" | "2-3" → a number. Returns null if it isn't one. */
function toNumber(text: string): number | null {
    let s = text.trim();
    if (!s) return null;

    // A range: take the upper bound. Being over is recoverable; being short
    // means a second trip to the shop.
    const range = s.match(/^([\d.,/\s¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+?)\s*(?:-|–|—|to)\s*([\d.,/\s¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)$/);
    if (range) s = range[2].trim();

    // Expand vulgar fractions, including the "1½" written without a space.
    for (const [glyph, value] of Object.entries(VULGAR)) {
        if (s.includes(glyph)) {
            const whole = parseFloat(s.replace(glyph, "").replace(",", ".").trim());
            return (Number.isFinite(whole) ? whole : 0) + value;
        }
    }

    // Mixed number: "1 1/2"
    const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

    // Plain fraction: "3/4"
    const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);

    // Decimal, tolerating the European comma.
    const plain = Number(s.replace(",", "."));
    return Number.isFinite(plain) ? plain : null;
}

/** Strip balanced parentheses, returning the cleaned text and what was removed. */
function splitNotes(line: string): { text: string; note: string } {
    let depth = 0;
    let text = "";
    let note = "";
    for (const ch of line) {
        if (ch === "(") { depth++; if (depth === 1) { note += note ? "; " : ""; continue; } }
        if (ch === ")" && depth > 0) { depth--; continue; }
        if (depth > 0) note += ch; else text += ch;
    }
    return { text: text.replace(/\s+/g, " ").trim(), note: note.replace(/\s+/g, " ").trim() };
}

const NUMBER_TOKEN = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]`;
const LEADING = new RegExp(
    String.raw`^\s*((?:${NUMBER_TOKEN})(?:\s+\d+\s*\/\s*\d+)?(?:\s*(?:-|–|—|to)\s*(?:${NUMBER_TOKEN}))?)\s*([a-zA-Z]+\.?)?\s*(.*)$`,
);

/**
 * "1 lb / 500g beef steak" — recipe sites that serve both audiences write the
 * amount twice. Prefer the metric half, because that is what the app displays
 * and what a Dutch supermarket labels.
 */
function preferMetricHalf(text: string): string {
    const dual = text.match(
        new RegExp(String.raw`^\s*((?:${NUMBER_TOKEN})[^/]*?)\s*/\s*((?:${NUMBER_TOKEN})\s*[a-zA-Z]+\.?)\s+(.*)$`),
    );
    if (!dual) return text;
    const [, first, second, rest] = dual;
    const unitOf = (half: string) => {
        const m = half.trim().match(new RegExp(String.raw`(?:${NUMBER_TOKEN})\s*([a-zA-Z]+)`));
        return m ? UNITS[m[1].toLowerCase()] : undefined;
    };
    const a = unitOf(first);
    const b = unitOf(second);
    const metric = (u?: UnitDef) => !!u && ["g", "kg", "ml", "l"].includes(u.canonical);
    if (metric(b) && !metric(a)) return `${second.trim()} ${rest}`;
    return `${first.trim()} ${rest}`;
}

export function parseIngredient(raw: string): ParsedIngredient {
    const line = raw.replace(/^[-*•\s]+/, "").replace(/^\[\s*[x ]?\s*\]\s*/i, "").trim();
    const { text, note } = splitNotes(line);
    const cleaned = preferMetricHalf(text);

    const m = cleaned.match(LEADING);
    if (!m) {
        return { qty: null, unit: null, family: null, item: cleaned.toLowerCase(), note, raw };
    }

    const qty = toNumber(m[1]);
    const maybeUnit = (m[2] || "").replace(/\.$/, "").toLowerCase();
    const def = UNITS[maybeUnit];

    // A word that isn't a unit belongs to the item ("2 garlic cloves" parses as
    // qty 2 + item "garlic cloves", not unit "garlic").
    const item = (def ? m[3] : [m[2], m[3]].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();

    return {
        qty,
        unit: def ? def.canonical : null,
        family: def ? def.family : qty !== null ? "count" : null,
        item: item.toLowerCase(),
        note,
        raw,
    };
}

/** Multiply a parsed line for a different number of servings. */
export function scale(p: ParsedIngredient, factor: number): ParsedIngredient {
    if (p.qty === null || factor === 1) return p;
    return { ...p, qty: p.qty * factor };
}

// ── aggregation ─────────────────────────────────────────────────────────────

export interface ShoppingLine {
    item: string;
    /** One entry per unit family present — mass and volume never merge. */
    amounts: Array<{ qty: number | null; unit: string | null; display: string }>;
    /** Which recipes asked for it, for the "why is this here" tooltip. */
    sources: string[];
    /** Lines we could not put a number on, kept verbatim. */
    unparsed: string[];
}

function toBase(p: ParsedIngredient): number | null {
    if (p.qty === null) return null;
    if (!p.unit) return p.qty;
    const def = UNITS[p.unit];
    return def ? p.qty * def.base : p.qty;
}

/** Render a base amount back into the friendliest unit of its family. */
function display(base: number, family: UnitFamily, unitHint: string | null): string {
    const round = (n: number) => (Math.round(n * 100) / 100).toString();
    if (family === "mass") {
        return base >= 1000 ? `${round(base / 1000)} kg` : `${round(base)} g`;
    }
    if (family === "volume") {
        // Spoons stay spoons — "45 ml of soy sauce" is not how anyone shops.
        if (unitHint && ["tsp", "tbsp", "cup"].includes(unitHint)) {
            const def = UNITS[unitHint];
            return `${round(base / def.base)} ${unitHint}`;
        }
        return base >= 1000 ? `${round(base / 1000)} l` : `${round(base)} ml`;
    }
    return unitHint ? `${round(base)} ${unitHint}${base === 1 ? "" : "s"}` : round(base);
}

/**
 * Combine parsed lines into one entry per ingredient. Amounts in the same unit
 * family are summed; different families are listed side by side rather than
 * silently added, because 2 cloves of garlic plus 1 tsp of garlic paste is not
 * 3 of anything.
 */
export function aggregate(
    entries: Array<{ parsed: ParsedIngredient; source: string; key: string }>,
): ShoppingLine[] {
    const byKey = new Map<string, ShoppingLine & { _fam: Map<UnitFamily, { total: number; hint: string | null }> }>();

    for (const { parsed, source, key } of entries) {
        let line = byKey.get(key);
        if (!line) {
            line = { item: parsed.item || key, amounts: [], sources: [], unparsed: [], _fam: new Map() };
            byKey.set(key, line);
        }
        if (!line.sources.includes(source)) line.sources.push(source);

        const base = toBase(parsed);
        if (base === null || parsed.family === null) {
            line.unparsed.push(parsed.raw);
            continue;
        }
        const fam = line._fam.get(parsed.family) ?? { total: 0, hint: parsed.unit };
        fam.total += base;
        // Keep the first spoon-ish unit we saw so 2 tbsp + 1 tbsp reads "3 tbsp".
        if (!fam.hint) fam.hint = parsed.unit;
        line._fam.set(parsed.family, fam);
    }

    return [...byKey.values()].map((l) => {
        l.amounts = [...l._fam.entries()].map(([family, { total, hint }]) => ({
            qty: total,
            unit: hint,
            display: display(total, family, hint),
        }));
        const { _fam, ...rest } = l;
        void _fam;
        return rest;
    });
}
