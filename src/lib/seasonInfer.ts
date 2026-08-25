/**
 * OM42 — work out roughly when a dish belongs.
 *
 * Max, 2026-08-25: "the in season doesn't work right now". It couldn't:
 * `isInSeason` treats an empty `seasons` array as year-round and passes it, and
 * **no recipe had a season tag**, so the chip filtered nothing at all.
 *
 * Two signals, in order of trust:
 *   1. The recipe's own categories. "Winter Warmer" is a human saying winter.
 *   2. Ingredients that only make sense in one part of the year.
 *
 * Anything without a clear signal stays untagged, which means year-round and
 * always passes. That is deliberate: a filter that hides a dish because a
 * keyword list was unsure is worse than one that shows it.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";

const CATEGORY_SEASON: Record<string, Season[]> = {
    "winter warmer": ["autumn", "winter"],
    soup: ["autumn", "winter"],
    salad: ["spring", "summer"],
};

// Produce with a real season in Northern Europe, where these two live.
//
// Deliberately excludes cabbage and mushroom: both are in Asian cooking all
// year round and both mis-tagged Bao Buns and Bibimbap as winter dishes on the
// first pass. A needle that appears year-round is worse than no needle.
const INGREDIENT_SEASON: Array<{ needles: string[]; seasons: Season[] }> = [
    { needles: ["asparagus", "rhubarb", "broad bean", "new potato", "spring onion", "wild garlic", "radish"], seasons: ["spring"] },
    { needles: ["strawberr", "raspberr", "blueberr", "watermelon", "courgette", "zucchini", "basil", "tomato", "corn on the cob", "peach", "apricot", "cherr", "cucumber", "aubergine", "eggplant"], seasons: ["summer"] },
    { needles: ["pumpkin", "butternut", "squash", "apple", "pear", "fig", "chestnut", "blackberr", "beetroot", "kale"], seasons: ["autumn"] },
    { needles: ["parsnip", "swede", "turnip", "brussels sprout", "leek", "celeriac", "clementine", "cranberr", "venison", "oxtail", "brisket", "shin of beef"], seasons: ["winter"] },
];

// Cooking that says the weather without naming an ingredient.
const METHOD_SEASON: Array<{ needles: string[]; seasons: Season[] }> = [
    { needles: ["braise", "slow-cook", "slow cook", "stew", "casserole", "roast for", "hot pot"], seasons: ["autumn", "winter"] },
    { needles: ["barbecue", "bbq", "grill over", "chargrill", "no-cook", "chilled soup", "gazpacho"], seasons: ["summer"] },
];

function hits(text: string, needles: string[]): boolean {
    return needles.some((n) => text.includes(n));
}

export interface SeasonInference {
    seasons: Season[];
    /** Which signal decided it — useful when a tag looks wrong. */
    basis: "category" | "ingredients" | "method" | "none";
}

export function inferSeasons(
    categories: string[] | null | undefined,
    ingredients: string | null | undefined,
    instructions?: string | null,
): SeasonInference {
    // 1 — a category is a person's own judgement; trust it over any keyword.
    const cats = (categories ?? []).map((c) => c.toLowerCase().trim());
    const fromCategory = new Set<Season>();
    for (const c of cats) {
        for (const [key, seasons] of Object.entries(CATEGORY_SEASON)) {
            if (c.includes(key)) seasons.forEach((s) => fromCategory.add(s));
        }
    }
    if (fromCategory.size) return { seasons: [...fromCategory], basis: "category" };

    const text = `${ingredients ?? ""}`.toLowerCase();
    if (text.trim()) {
        const votes = new Map<Season, number>();
        for (const { needles, seasons } of INGREDIENT_SEASON) {
            if (hits(text, needles)) seasons.forEach((s) => votes.set(s, (votes.get(s) ?? 0) + 1));
        }
        // Only claim a season when one clearly leads — a dish with both
        // strawberries and parsnips is telling us nothing.
        if (votes.size) {
            const top = Math.max(...votes.values());
            const leaders = [...votes.entries()].filter(([, v]) => v === top).map(([s]) => s);
            if (leaders.length <= 2) return { seasons: leaders, basis: "ingredients" };
        }
    }

    const method = `${instructions ?? ""}`.toLowerCase();
    if (method.trim()) {
        for (const { needles, seasons } of METHOD_SEASON) {
            if (hits(method, needles)) return { seasons, basis: "method" };
        }
    }

    return { seasons: [], basis: "none" };
}
