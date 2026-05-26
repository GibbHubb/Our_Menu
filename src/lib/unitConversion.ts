// OM27 — Display-time unit conversion (metric ⇄ US).
//
// Scope per plan §4: same-dimension only — mass ↔ mass, volume ↔ volume.
// No cup-flour-→-g cross-dimension guessing (that needs an ingredient
// density table; tracked as a possible followup).
//
// User pref lives in localStorage (no DB column, no schema change).

export type UnitSystem = 'metric' | 'us';

const PREF_KEY = 'om27_unit_system';

export function getUnitSystem(): UnitSystem {
    if (typeof window === 'undefined') return 'metric';
    const v = window.localStorage.getItem(PREF_KEY);
    return v === 'us' ? 'us' : 'metric';
}

export function setUnitSystem(s: UnitSystem): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREF_KEY, s);
    // Notify any listening hooks within the same tab.
    window.dispatchEvent(new Event('om27-unit-system-changed'));
}


// Normalise a unit token to a canonical key. Unknown → null (no convert).
function unitKey(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const u = raw.trim().toLowerCase().replace(/\.$/, '');
    const map: Record<string, string> = {
        // mass — metric
        'g': 'g', 'gram': 'g', 'grams': 'g', 'gr': 'g',
        'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
        // mass — US
        'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
        'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
        // volume — metric
        'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml', 'millilitre': 'ml', 'millilitres': 'ml',
        'l': 'l', 'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l',
        // volume — US
        'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
        'tbsp': 'tbsp', 'tbs': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
        'fl oz': 'floz', 'floz': 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz',
        'cup': 'cup', 'cups': 'cup', 'c': 'cup',
        'pt': 'pt', 'pint': 'pt', 'pints': 'pt',
        'qt': 'qt', 'quart': 'qt', 'quarts': 'qt',
        'gal': 'gal', 'gallon': 'gal', 'gallons': 'gal',
    };
    return map[u] || null;
}


// Same-dimension grouping.
const MASS = new Set(['g', 'kg', 'oz', 'lb']);
const VOLUME = new Set(['ml', 'l', 'tsp', 'tbsp', 'floz', 'cup', 'pt', 'qt', 'gal']);

// To base (mass → grams, volume → millilitres).
const TO_BASE: Record<string, number> = {
    g: 1, kg: 1000,
    oz: 28.3495, lb: 453.592,
    ml: 1, l: 1000,
    tsp: 4.92892, tbsp: 14.7868,
    floz: 29.5735, cup: 236.588, pt: 473.176, qt: 946.353, gal: 3785.41,
};


function isMetric(key: string): boolean {
    return ['g', 'kg', 'ml', 'l'].includes(key);
}


// Round to a sensible step per target unit so we don't print 2.3456789 oz.
function round(value: number, target: string): number {
    const steps: Record<string, number> = {
        g: 1, kg: 0.05,
        ml: 1, l: 0.05,
        oz: 0.25, lb: 0.1,
        tsp: 0.25, tbsp: 0.25, floz: 0.25,
        cup: 0.25, pt: 0.25, qt: 0.25, gal: 0.25,
    };
    const s = steps[target] || 0.1;
    return Math.round(value / s) * s;
}


/**
 * Convert (qty, unit) for display in the requested system. Returns
 * { quantity, unit } in the target system, or the original pair if the
 * unit is unknown or already in-system.
 */
export function convertForDisplay(
    quantity: number | null,
    unit: string | null,
    system: UnitSystem,
): { quantity: number | null; unit: string | null } {
    if (quantity === null || unit == null) return { quantity, unit };
    const key = unitKey(unit);
    if (!key) return { quantity, unit };
    const sourceIsMetric = isMetric(key);
    const wantMetric = system === 'metric';
    if (sourceIsMetric === wantMetric) return { quantity, unit };

    // Convert to base, then pick a target unit of the same dimension.
    const baseAmount = quantity * (TO_BASE[key] || 1);
    let target: string;
    if (MASS.has(key)) {
        if (wantMetric) {
            target = baseAmount >= 1000 ? 'kg' : 'g';
        } else {
            target = baseAmount >= 453.592 ? 'lb' : 'oz';
        }
    } else if (VOLUME.has(key)) {
        if (wantMetric) {
            target = baseAmount >= 1000 ? 'l' : 'ml';
        } else {
            // Walk: tsp → tbsp → cup → pt → qt
            if (baseAmount < 7.5) target = 'tsp';
            else if (baseAmount < 30) target = 'tbsp';
            else if (baseAmount < 473.176) target = 'cup';
            else if (baseAmount < 946.353) target = 'pt';
            else target = 'qt';
        }
    } else {
        return { quantity, unit };
    }

    const converted = baseAmount / (TO_BASE[target] || 1);
    return { quantity: round(converted, target), unit: target };
}
