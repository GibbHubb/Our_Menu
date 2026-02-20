
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

    const lowerRest = rest.toLowerCase();
    const isStandard = STANDARD_ITEMS.some(si =>
        lowerRest === si ||
        lowerRest.startsWith(si + ' ') ||
        lowerRest.endsWith(' ' + si) ||
        lowerRest.includes(' ' + si + ' ')
    );

    return {
        original: line, // Keep full original for safety? Or clean? Let's keep original for ref, but use clean for display
        name: rest,
        quantity,
        unit: null,
        isStandard,
        isChecked: !isStandard,
        id: `item-${idx}-${Date.now()}` // fallback unique id
    };
};
