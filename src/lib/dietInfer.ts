/**
 * OM40 — infer diet tags from an ingredient list.
 *
 * OM30 deliberately made these tags owner-set: an empty `diet` array means
 * "nobody has asserted this is safe", not "safe for everything". That was the
 * right call and it is why every diet chip matched zero of 96 recipes.
 *
 * Max's call, 2026-08-25: infer all four, flag them as machine-written, show
 * that in the UI. So the rules below are deliberately PESSIMISTIC — they only
 * claim a diet when nothing in the list contradicts it, and they refuse to
 * claim anything at all for a recipe whose ingredients are too thin to judge.
 *
 * ⚠️ These are a filter aid, not an allergen check. Hidden gluten in a stock
 * cube and hidden fish in a Thai curry paste are exactly the cases a keyword
 * list cannot see, which is why `diet_auto` exists and the UI says so.
 */

export type Diet = "vegetarian" | "vegan" | "gluten-free" | "dairy-free";

const MEAT = [
    "beef", "steak", "mince", "pork", "bacon", "ham", "prosciutto", "pancetta", "chorizo",
    "sausage", "salami", "lamb", "mutton", "veal", "chicken", "turkey", "duck", "goose",
    "oxtail", "brisket", "chuck", "rib", "thigh", "drumstick", "wing", "lard", "gelatin",
    "gelatine", "stock cube", "chicken stock", "beef stock", "bone broth", "pepperoni",
];
const FISH = [
    "fish", "salmon", "tuna", "cod", "haddock", "snapper", "kingfish", "barramundi",
    "anchov", "sardine", "prawn", "shrimp", "crab", "lobster", "squid", "calamari",
    "octopus", "mussel", "clam", "oyster", "scallop", "fish sauce", "oyster sauce",
    "shrimp paste", "belacan", "bonito", "dashi", "worcestershire",
];
const DAIRY = [
    "milk", "butter", "cream", "creme", "crème", "cheese", "parmesan", "parmigiano",
    "pecorino", "mozzarella", "ricotta", "mascarpone", "feta", "halloumi", "yoghurt",
    "yogurt", "ghee", "custard", "buttermilk", "condensed milk", "evaporated milk",
];
const EGG = ["egg", "eggs", "mayonnaise", "mayo", "aioli", "meringue"];
const HONEY = ["honey"];
const GLUTEN = [
    "flour", "bread", "breadcrumb", "panko", "pasta", "spaghetti", "penne", "rigatoni",
    "noodle", "lasagne", "lasagna", "couscous", "barley", "bulgur", "semolina", "farro",
    "pastry", "puff pastry", "filo", "phyllo", "wonton", "dumpling wrapper", "tortilla",
    "bun", "brioche", "bagel", "cracker", "biscuit", "beer", "soy sauce", "hoisin",
    "oyster sauce", "seitan", "orzo", "ramen", "udon", "cake", "croissant", "baguette",
];

// "coconut milk" is not dairy, "almond milk" is not dairy, and a vegan recipe
// that says "vegan butter" should not be disqualified by the word butter.
const DAIRY_EXCEPTIONS = ["coconut milk", "coconut cream", "almond milk", "oat milk", "soy milk", "soya milk", "rice milk", "cashew cream", "vegan butter", "peanut butter", "nut butter", "almond butter", "cocoa butter", "shea butter", "buttercup", "butterhead", "butternut", "butter lettuce", "butter bean"];
const GLUTEN_EXCEPTIONS = ["rice noodle", "glass noodle", "vermicelli", "gluten-free", "gluten free", "rice flour", "corn flour", "cornflour", "almond flour", "tamari", "rice paper", "buckwheat", "coconut flour", "chickpea flour", "potato flour"];

function haystack(ingredients: string): string {
    return ingredients.toLowerCase().replace(/\s+/g, " ");
}

/** Does the text mention any needle, discounting the listed exceptions? */
function mentions(text: string, needles: string[], exceptions: string[] = []): boolean {
    for (const n of needles) {
        let from = 0;
        for (;;) {
            const at = text.indexOf(n, from);
            if (at === -1) break;
            // Look at the surrounding words: "coconut milk" must not trip "milk".
            const window = text.slice(Math.max(0, at - 20), at + n.length + 12);
            if (!exceptions.some((ex) => window.includes(ex))) return true;
            from = at + n.length;
        }
    }
    return false;
}

export interface DietInference {
    diets: Diet[];
    /** Why we declined to judge, when we did. */
    skipped?: string;
}

/**
 * A recipe needs a real ingredient list before any of this means anything.
 * Four lines of "• Chicken / • Rice" is not enough to assert dairy-free.
 */
export function inferDiets(ingredients: string | null | undefined): DietInference {
    const raw = (ingredients ?? "").trim();
    if (!raw) return { diets: [], skipped: "no ingredients" };

    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 5) return { diets: [], skipped: "ingredient list too thin to judge" };

    const text = haystack(raw);
    const hasMeat = mentions(text, MEAT);
    const hasFish = mentions(text, FISH);
    const hasDairy = mentions(text, DAIRY, DAIRY_EXCEPTIONS);
    const hasEgg = mentions(text, EGG);
    const hasHoney = mentions(text, HONEY);
    const hasGluten = mentions(text, GLUTEN, GLUTEN_EXCEPTIONS);

    const diets: Diet[] = [];
    const vegetarian = !hasMeat && !hasFish;
    if (vegetarian) diets.push("vegetarian");
    if (vegetarian && !hasDairy && !hasEgg && !hasHoney) diets.push("vegan");
    if (!hasGluten) diets.push("gluten-free");
    if (!hasDairy) diets.push("dairy-free");

    return { diets };
}
