
export interface ParsedItem {
    original: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    isStandard: boolean;
    isChecked: boolean;
    id: string;
}

export const STANDARD_ITEMS = [
    "salt", "pepper", "black pepper", "white pepper",
    "oil", "olive oil", "vegetable oil", "sunflower oil", "canola oil",
    "water",
    "sugar",
    "flour",
    "spices", "spice"
];

// Regex to find quantity at start: "1.5 cups...", "1/2 tsp...", "2 onions"
const QUANTITY_REGEX = /^(\d+(?:\.\d+)?|\d+\/\d+)\s*(.*)$/;

// OM31 — mass/volume units we recognise immediately after a quantity, so we
// can split "1 cup flour" → { quantity: 1, unit: "cup", name: "flour" }. Only
// convertible units are listed (countable units like "clove"/"slice" stay in
// the name so no conversion is attempted). Unknown leading words are left in
// the name and unit stays null.
const CONVERTIBLE_UNITS = new Set([
    'g', 'gram', 'grams', 'gr', 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms',
    'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
    'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres',
    'l', 'liter', 'liters', 'litre', 'litres',
    'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tbs', 'tablespoon', 'tablespoons',
    'cup', 'cups', 'c',
    'pt', 'pint', 'pints', 'qt', 'quart', 'quarts', 'gal', 'gallon', 'gallons',
    'floz',
]);

// Split a leading convertible unit off the remainder. Returns the canonical-ish
// unit token (kept as-typed; unitConversion normalises it) + the name without
// the unit, or { unit: null, name: rest } when no unit is recognised.
const extractUnit = (rest: string): { unit: string | null; name: string } => {
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { unit: null, name: rest };
    const first = tokens[0].toLowerCase().replace(/\.$/, '');
    // "fl oz" arrives as two tokens.
    if (first === 'fl' && tokens[1] && tokens[1].toLowerCase().replace(/\.$/, '') === 'oz') {
        return { unit: 'fl oz', name: tokens.slice(2).join(' ') };
    }
    if (CONVERTIBLE_UNITS.has(first)) {
        return { unit: tokens[0], name: tokens.slice(1).join(' ') };
    }
    return { unit: null, name: rest };
};

export const parseQuantity = (str: string): number => {
    if (str.includes('/')) {
        const [num, den] = str.split('/').map(Number);
        return den !== 0 ? num / den : 0;
    }
    return parseFloat(str);
};

export const formatQuantity = (num: number): string => {
    if (Math.abs(num % 1) < 0.01) return num.toFixed(0);

    const decimal = num % 1;
    const whole = Math.floor(num);
    const closeTo = (n: number, target: number) => Math.abs(n - target) < 0.05;

    let fraction = "";
    if (closeTo(decimal, 0.25)) fraction = "1/4";
    else if (closeTo(decimal, 0.33)) fraction = "1/3";
    else if (closeTo(decimal, 0.5)) fraction = "1/2";
    else if (closeTo(decimal, 0.66)) fraction = "2/3";
    else if (closeTo(decimal, 0.75)) fraction = "3/4";

    if (fraction) {
        return whole > 0 ? `${whole} ${fraction}` : fraction;
    }

    return num.toFixed(1).replace(/\.0$/, '');
};

export const cleanIngredientLine = (line: string): string => {
    // Remove [ ] or [] or - [ ] anywhere in the string, and bullet points at the start
    return line
        .replace(/\[\s*\]/g, '') // remove all empty brackets like [ ] or []
        .replace(/^-\s*/, '')    // remove leading hyphen
        .replace(/^[*•]\s*/, '') // remove bullet points
        .trim();
};

export const parseIngredientLine = (line: string, idx: number): ParsedItem => {
    const cleanLine = cleanIngredientLine(line);
    const match = cleanLine.match(QUANTITY_REGEX);

    let quantity: number | null = null;
    let rest = cleanLine;

    if (match) {
        quantity = parseQuantity(match[1]);
        rest = match[2];
    }

    // OM31 — only split a unit when there is a leading quantity ("2 cups flour");
    // a bare "cup" with no number is ambiguous and stays part of the name.
    const { unit, name } = match ? extractUnit(rest) : { unit: null, name: rest };

    const lowerName = name.toLowerCase();
    const isStandard = STANDARD_ITEMS.some(si =>
        lowerName === si ||
        lowerName.startsWith(si + ' ') ||
        lowerName.endsWith(' ' + si) ||
        lowerName.includes(' ' + si + ' ')
    );

    return {
        original: line, // Keep full original for safety? Or clean? Let's keep original for ref, but use clean for display
        name,
        quantity,
        unit,
        isStandard,
        isChecked: !isStandard,
        id: `item-${idx}-${Date.now()}` // fallback unique id
    };
};
