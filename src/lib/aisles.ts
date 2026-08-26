/**
 * OM45 — group the shopping list the way a shop is laid out.
 *
 * An alphabetical list sends you from apples to beef to bread to butter and
 * back to the vegetables. Grouping by section means one lap: produce first
 * because it's by the door, freezer last because it melts.
 *
 * Matching is on the canonical ingredient name (the same key the list already
 * aggregates by), so "spaghetti or other pasta, long or short" and "spaghetti"
 * land in the same aisle for the same reason they became one line.
 *
 * Anything unrecognised goes to "Other" rather than being guessed at — a
 * misfiled item you can't find is worse than one in a catch-all at the end.
 */

export type Aisle =
    | "produce" | "meat" | "fish" | "dairy" | "bakery"
    | "cupboard" | "spices" | "frozen" | "drinks" | "household" | "other";

/** Shop order: roughly a lap of a supermarket, freezer last. */
export const AISLE_ORDER: Aisle[] = [
    "produce", "bakery", "meat", "fish", "dairy",
    "cupboard", "spices", "frozen", "drinks", "household", "other",
];

export const AISLE_LABEL: Record<Aisle, string> = {
    produce: "Fruit & veg",
    bakery: "Bakery",
    meat: "Meat",
    fish: "Fish & seafood",
    dairy: "Dairy & chilled",
    cupboard: "Cupboard",
    spices: "Herbs & spices",
    frozen: "Frozen",
    drinks: "Drinks",
    household: "Household",
    other: "Other",
};

export const AISLE_EMOJI: Record<Aisle, string> = {
    produce: "🥬", bakery: "🥖", meat: "🥩", fish: "🐟", dairy: "🧀",
    cupboard: "🥫", spices: "🌿", frozen: "🧊", drinks: "🧃", household: "🧻", other: "🛒",
};

// Longest match wins, so "spring onion" beats "onion" and "coconut milk"
// beats "milk" — which is the whole reason this is a list and not a map.
const RULES: Array<[Aisle, string[]]> = [
    ["produce", [
        "onion", "spring onion", "shallot", "garlic", "ginger", "potato", "carrot", "celery",
        "tomato", "cherry tomato", "lettuce", "salad", "spinach", "kale", "cabbage", "broccoli",
        "cauliflower", "courgette", "zucchini", "aubergine", "eggplant", "capsicum",
        "bell pepper", "red pepper", "green pepper", "yellow pepper", "sweet pepper",
        "chilli", "chili", "cucumber", "mushroom", "leek", "pumpkin", "squash", "sweet potato",
        "beetroot", "radish", "asparagus", "green bean", "pea", "sprout", "corn", "avocado",
        "lemon", "lime", "orange", "apple", "pear", "banana", "berry", "strawberr", "blueberr",
        "raspberr", "mango", "pineapple", "grape", "peach", "plum", "coriander", "cilantro",
        "parsley", "basil", "mint", "dill", "rosemary", "thyme", "sage", "chive", "rocket",
        "bok choy", "pak choi", "gai lan", "bean sprout", "lemongrass", "kaffir lime",
    ]],
    ["bakery", ["bread", "sourdough", "baguette", "bun", "brioche", "bagel", "pitta", "pita",
        "tortilla", "wrap", "naan", "croissant", "pastry", "puff pastry", "filo", "phyllo",
        "breadcrumb", "panko", "crouton"]],
    ["meat", ["beef", "steak", "mince", "chicken", "thigh", "drumstick", "wing", "pork", "bacon",
        "ham", "sausage", "chorizo", "salami", "prosciutto", "pancetta", "guanciale", "lamb",
        "duck", "turkey", "veal", "oxtail", "brisket", "rib", "meatball"]],
    ["fish", ["fish", "salmon", "tuna", "cod", "haddock", "snapper", "kingfish", "barramundi",
        "prawn", "shrimp", "crab", "lobster", "squid", "calamari", "mussel", "clam", "oyster",
        "scallop", "anchov", "sardine"]],
    ["dairy", ["milk", "butter", "cream", "creme fraiche", "cheese", "parmesan", "parmigiano",
        "pecorino", "mozzarella", "ricotta", "mascarpone", "feta", "halloumi", "yoghurt",
        "yogurt", "egg", "custard", "buttermilk", "tofu"]],
    ["cupboard", ["flour", "sugar", "rice", "pasta", "spaghetti", "noodle", "lentil", "chickpea",
        "bean", "butter bean", "cannellini", "borlotti", "kidney bean", "tin", "can", "tomato paste", "passata", "stock", "broth", "oil", "olive oil",
        "vinegar", "soy sauce", "fish sauce", "oyster sauce", "hoisin", "mirin", "sesame oil",
        "honey", "syrup", "jam", "peanut butter", "coconut milk", "coconut cream", "curry paste",
        "mustard", "mayonnaise", "ketchup", "gochujang", "miso", "tahini", "olive", "caper",
        "nut", "almond", "cashew", "walnut", "peanut", "seed", "oat", "cereal", "couscous",
        "quinoa", "polenta", "cornflour", "baking powder", "yeast", "chocolate", "cocoa",
        "vanilla", "gelatin", "biscuit", "cracker", "crisp",
    ]],
    ["spices", ["salt", "black pepper", "white pepper", "peppercorn", "cracked pepper", "paprika", "cumin", "coriander powder", "turmeric", "cinnamon",
        "nutmeg", "cardamom", "clove", "star anise", "bay leaf", "oregano", "chilli powder",
        "chilli flake", "curry powder", "garam masala", "five spice", "szechuan", "saffron",
        "fennel seed", "mustard seed", "sesame seed", "za'atar", "sumac", "dried"]],
    ["frozen", ["frozen", "ice cream", "peas frozen", "puff pastry frozen"]],
    ["drinks", ["wine", "beer", "stock cube", "juice", "coffee", "tea", "limoncello", "vodka",
        "rum", "whisky", "brandy", "sherry", "sake", "coconut water"]],
    ["household", ["washing", "detergent", "bin bag", "kitchen roll", "toilet", "toothpaste",
        "shampoo", "soap", "sponge", "cleaner", "bleach", "foil", "cling film", "baking paper",
        "battery", "razor", "deodorant", "floss"]],
];

/** Which section of the shop this belongs in. */
export function aisleFor(name: string): Aisle {
    const n = name.toLowerCase().trim();
    if (!n) return "other";

    let best: Aisle = "other";
    let bestLen = 0;
    for (const [aisle, needles] of RULES) {
        for (const needle of needles) {
            if (needle.length > bestLen && n.includes(needle)) {
                best = aisle;
                bestLen = needle.length;
            }
        }
    }
    return best;
}
