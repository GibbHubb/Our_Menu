// OM70 — the demo kitchen a signed-out visitor sees.
//
// Built entirely from INITIAL_RECIPES, which already ships in this public repo,
// so a guest never queries Supabase: no RLS change, no way to read a household's
// real recipes, and nothing a visitor can vandalise. Ids are `demo-<slug>` so a
// demo id can never collide with a real (uuid) row id.
import { INITIAL_RECIPES } from "./initialData";
import type { Category, Recipe } from "./types";

export const DEMO_ID_PREFIX = "demo-";
/** OM71 — where the pre-generated demo photos are served from (public/demo/). */
export const DEMO_IMAGE_DIR = "/demo";

// A fixed timestamp so the list renders identically on server and client.
const DEMO_CREATED_AT = "2026-01-01T00:00:00.000Z";

function slugify(title: string): string {
    return title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function buildDemoRecipes(): Recipe[] {
    const seen = new Map<string, number>();
    const out: Recipe[] = [];
    for (const seed of INITIAL_RECIPES) {
        if (!seed.title) continue;
        const base = slugify(seed.title) || "recipe";
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const slug = n === 1 ? base : `${base}-${n}`;
        out.push({
            ...seed,
            id: `${DEMO_ID_PREFIX}${slug}`,
            created_at: DEMO_CREATED_AT,
            title: seed.title,
            category: (seed.category ?? []) as Category[],
            // OM71 — each demo recipe has its own photo, generated ONCE and
            // stored in public/demo/<slug>.webp. Never the live pollinations.ai
            // URL from the seed: its free tier answers most requests with a
            // "Free limit reached" banner image (seen in OM70's verify run).
            image_url: `${DEMO_IMAGE_DIR}/${slug}.webp`,
            user_id: null,
            household_id: null,
            is_public: false,
        });
    }
    return out;
}

export const DEMO_RECIPES: Recipe[] = buildDemoRecipes();

const BY_ID = new Map(DEMO_RECIPES.map((r) => [r.id, r]));

export function isDemoId(id: string): boolean {
    return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX);
}

export function getDemoRecipe(id: string): Recipe | undefined {
    return isDemoId(id) ? BY_ID.get(id) : undefined;
}
