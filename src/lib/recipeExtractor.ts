/**
 * Shared recipe extraction logic.
 *
 * Used by both the offline batch script (`scripts/extract_ingredients.ts`)
 * and the per-recipe API route (`/api/recipes/[id]/extract`).
 *
 * Strategy: try JSON-LD first (fast, deterministic). If it doesn't yield
 * ingredients, fall back to the LAN LLM. Both paths can return partial
 * results — the caller decides what to do with what it gets back.
 */

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://192.168.2.182:8003";
const LLM_DEFAULT_MODEL =
    process.env.LLM_DEFAULT_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct";

export interface ExtractedRecipe {
    ingredients: string[];
    instructions: string[];
    /**
     * OM40 — base yield from the page's `recipeYield`, so the shopping list can
     * answer "how much for 6 people". null when the page doesn't say; the
     * caller must then scale ×1 rather than guess a base.
     */
    servings: number | null;
    /** which path produced the data — useful for logging + UI hints */
    sourcePath: "json-ld" | "llm" | "mixed" | "none";
    /** non-fatal warnings worth surfacing to the caller */
    warnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// JSON-LD extraction
// ────────────────────────────────────────────────────────────────────────────

interface JsonLdRecipe {
    "@type"?: string | string[];
    "@graph"?: unknown[];
    recipeYield?: string | number | Array<string | number>;
    recipeIngredient?: string | string[];
    recipeInstructions?:
        | string
        | string[]
        | Array<{ "@type"?: string; text?: string; name?: string }>;
}

/**
 * Find the Recipe node anywhere in a JSON-LD document.
 *
 * This used to recurse into arrays and `@graph` only, which missed any site
 * that hangs the Recipe off another key — allrecipes.com and natashaskitchen
 * both do, and both were reported to the user as "no structured data found"
 * while serving a complete Recipe node. Walk every value instead; the depth
 * cap keeps a pathological document from running away.
 */
function findRecipeNode(obj: unknown, depth = 0): JsonLdRecipe | null {
    if (!obj || depth > 12) return null;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findRecipeNode(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof obj === "object") {
        const o = obj as JsonLdRecipe & Record<string, unknown>;
        const t = o["@type"];
        if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
        for (const value of Object.values(o)) {
            if (value && typeof value === "object") {
                const found = findRecipeNode(value, depth + 1);
                if (found) return found;
            }
        }
    }
    return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Fallbacks for pages with no <script type="application/ld+json"> Recipe
// ────────────────────────────────────────────────────────────────────────────

/** Strip tags and collapse whitespace — good enough for a list item. */
function htmlToText(fragment: string): string {
    return cleanText(fragment);
}

/**
 * Some sites ship the very same Recipe JSON inside an ordinary inline script
 * (a plugin's config blob, a Next.js payload) rather than an ld+json tag.
 * loveandlemons.com is one. Find `"recipeIngredient"`, then walk backwards to
 * the `{` that opens a balanced, parseable object around it.
 */
function tryEmbeddedJson(html: string): JsonLdRecipe | null {
    const NEEDLE = /"recipeIngredient"\s*:/g;
    let m: RegExpExecArray | null;
    let searches = 0;
    while ((m = NEEDLE.exec(html)) !== null && searches < 5) {
        searches++;
        const idx = m.index;
        let tried = 0;
        for (let b = idx; b >= 0 && idx - b < 200_000 && tried < 400; b--) {
            if (html[b] !== "{") continue;
            tried++;
            const blob = readBalancedObject(html, b);
            if (!blob || b + blob.length < idx) continue;
            try {
                const parsed = JSON.parse(blob) as JsonLdRecipe;
                if (parsed?.recipeIngredient) return parsed;
            } catch {
                /* not the object we want — keep walking out */
            }
        }
    }
    return null;
}

/** Read a `{...}` starting at `start`, respecting strings and escapes. */
function readBalancedObject(text: string, start: number): string | null {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

/**
 * HTML microdata — `itemprop="recipeIngredient"` on the visible markup, which
 * is what recipearce.com and other non-JSON-LD sites use.
 */
function tryMicrodata(html: string): { ingredients: string[]; instructions: string[]; servings: number | null } {
    const collect = (prop: string): string[] => {
        const out: string[] = [];
        const tagged = new RegExp(
            `<(\\w+)[^>]*itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)</\\1>`, "gi",
        );
        let m: RegExpExecArray | null;
        while ((m = tagged.exec(html)) !== null) {
            const t = htmlToText(m[2]);
            if (t) out.push(t);
        }
        if (out.length) return out;
        // Some templates put the value in a content attribute instead.
        const attr = new RegExp(
            `<\\w+[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`, "gi",
        );
        while ((m = attr.exec(html)) !== null) out.push(m[1].trim());
        return out;
    };

    const ingredients = collect("recipeIngredient");
    const instructions = collect("recipeInstructions");
    const yieldText = collect("recipeYield")[0];
    return { ingredients, instructions, servings: parseYield(yieldText) };
}

/**
 * JSON-LD text fields are allowed to contain markup — plenty of sites put
 * `<br>`, links and entities inside `text`. Flatten to something a person can
 * read in a plain <p>, and collapse the runs of whitespace that come from
 * pretty-printed source.
 */
function cleanText(s: string): string {
    return s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function normaliseInstructions(
    raw: JsonLdRecipe["recipeInstructions"],
): string[] {
    if (!raw) return [];
    if (typeof raw === "string") {
        // Some sites cram all steps into one string with newlines / numbers.
        return raw
            .split(/\n|(?<=[.!?])\s{2,}|^\s*\d+\.\s+/m)
            .map(cleanText)
            .filter(Boolean);
    }
    if (Array.isArray(raw)) {
        return raw.flatMap((item) => {
            if (typeof item === "string") return [cleanText(item)];
            if (item && typeof item === "object") {
                // A HowToSection ("For the marinade", "To serve") holds its
                // steps in itemListElement. Taking `name` here would keep the
                // heading and throw away every step under it.
                const section = item as {
                    "@type"?: string;
                    itemListElement?: JsonLdRecipe["recipeInstructions"];
                    text?: string;
                    name?: string;
                };
                if (section.itemListElement) {
                    return normaliseInstructions(section.itemListElement);
                }
                return [cleanText((section.text || section.name || "").toString())];
            }
            return [];
        }).filter(Boolean);
    }
    return [];
}

/**
 * `recipeYield` is one of the messiest fields in the schema: "4", 4, "4
 * servings", "Serves 4-6", ["4", "4 servings"]. Take the first integer we can
 * find, and refuse anything absurd — a yield of 0 or 400 is a parsing artefact,
 * and a wrong base silently mis-scales every quantity on the shopping list.
 */
function parseYield(raw: JsonLdRecipe["recipeYield"]): number | null {
    if (raw === undefined || raw === null) return null;
    const candidates = Array.isArray(raw) ? raw : [raw];
    for (const c of candidates) {
        const m = String(c).match(/\d+/);
        if (!m) continue;
        const n = Number(m[0]);
        if (Number.isInteger(n) && n >= 1 && n <= 50) return n;
    }
    return null;
}

function tryJsonLd(html: string): { ingredients: string[]; instructions: string[]; servings: number | null } {
    const out = { ingredients: [] as string[], instructions: [] as string[], servings: null as number | null };
    // The attribute is almost never alone on the tag: Yoast ships
    // `class="yoast-schema-graph"`, Cloudflare adds `data-cfasync="false"`,
    // and some themes single-quote the value. Requiring `type="…">` to close
    // the tag matched ZERO blocks on every WordPress food blog we link to —
    // the extractor then reported "no structured data" for pages that carry a
    // complete Recipe node. Match the attribute wherever it sits.
    const re =
        /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            const recipe = findRecipeNode(data);
            if (!recipe) continue;
            if (recipe.recipeIngredient) {
                const raw = recipe.recipeIngredient;
                const list = Array.isArray(raw) ? raw : [raw];
                out.ingredients = list.map((i) => cleanText(String(i))).filter(Boolean);
            }
            if (recipe.recipeInstructions) {
                out.instructions = normaliseInstructions(recipe.recipeInstructions);
            }
            out.servings = parseYield(recipe.recipeYield);
            // First Recipe block wins
            if (out.ingredients.length || out.instructions.length) break;
        } catch {
            // ignore malformed JSON-LD blocks; keep scanning
        }
    }
    return out;
}

// ────────────────────────────────────────────────────────────────────────────
// LLM fallback
// ────────────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, "\n")
        .replace(/\n\s*\n/g, "\n")
        .slice(0, 15000);
}

async function detectModel(): Promise<string> {
    try {
        const r = await fetch(`${LLM_BASE_URL}/v1/models`);
        if (!r.ok) return LLM_DEFAULT_MODEL;
        const data = await r.json();
        if (data?.data?.[0]?.id) return data.data[0].id;
    } catch {
        /* fall through */
    }
    return LLM_DEFAULT_MODEL;
}

interface LlmResult {
    ingredients: string[];
    instructions: string[];
}

async function extractWithLLM(url: string, html: string): Promise<LlmResult | null> {
    try {
        const text = stripHtml(html);
        const model = await detectModel();
        const prompt = `You are a recipe parser. From the webpage content below, extract:
1. The list of ingredients
2. The cooking instructions, broken into discrete steps

Return ONLY a JSON object with this exact shape, no commentary:
{"ingredients": ["1 onion", "500g beef"], "instructions": ["Heat oil.", "Sauté onion 5 min."]}

Webpage URL: ${url}

Content:
${text}`;

        const resp = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            "You extract recipe data into a strict JSON object {ingredients,instructions}. Output JSON only.",
                    },
                    { role: "user", content: prompt },
                ],
                temperature: 0.1,
                max_tokens: 1500,
            }),
        });

        if (!resp.ok) return null;
        const json = await resp.json();
        const content: string | undefined = json?.choices?.[0]?.message?.content;
        if (!content) return null;

        // Find first {...} block in the response
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
            try {
                const parsed = JSON.parse(objMatch[0]);
                return {
                    ingredients: Array.isArray(parsed.ingredients)
                        ? parsed.ingredients.map((s: unknown) => String(s).trim()).filter(Boolean)
                        : [],
                    instructions: Array.isArray(parsed.instructions)
                        ? parsed.instructions.map((s: unknown) => String(s).trim()).filter(Boolean)
                        : [],
                };
            } catch {
                /* fall through to bullet parse */
            }
        }

        // Last resort: bullet list of ingredients only
        const bullets = content
            .split("\n")
            .filter((l) => l.trim().startsWith("-"))
            .map((l) => l.replace(/^[-\s*]+/, "").trim());
        return bullets.length ? { ingredients: bullets, instructions: [] } : null;
    } catch {
        return null;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API — used by both the script and the route
// ────────────────────────────────────────────────────────────────────────────

/**
 * JSON-LD-only extraction — no LLM call.
 * Safe for serverless / Vercel environments where the LAN LLM is unreachable.
 * Returns sourcePath "none" (with a warning) when JSON-LD is absent.
 */
export async function extractJsonLdOnly(url: string): Promise<ExtractedRecipe> {
    let html = "";
    try {
        const resp = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (compatible; MaxBronMenu/1.0; +https://github.com/GibbHubb/Our_Menu)",
            },
        });
        if (!resp.ok) {
            return {
                ingredients: [],
                instructions: [],
                servings: null,
                sourcePath: "none",
                warnings: [`Source returned HTTP ${resp.status}`],
            };
        }
        html = await resp.text();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            ingredients: [],
            instructions: [],
            servings: null,
            sourcePath: "none",
            warnings: [`Could not fetch source URL: ${msg}`],
        };
    }

    let { ingredients, instructions, servings } = tryJsonLd(html);
    const warnings: string[] = [];

    // Fallback 1 — the same JSON, just not in an ld+json tag.
    if (!ingredients.length) {
        const embedded = tryEmbeddedJson(html);
        if (embedded?.recipeIngredient) {
            const raw = embedded.recipeIngredient;
            ingredients = (Array.isArray(raw) ? raw : [raw]).map((i) => cleanText(String(i))).filter(Boolean);
            if (!instructions.length) instructions = normaliseInstructions(embedded.recipeInstructions);
            servings = servings ?? parseYield(embedded.recipeYield);
            warnings.push("Read from JSON embedded in the page rather than a JSON-LD tag.");
        }
    }

    // Fallback 2 — HTML microdata on the visible markup.
    if (!ingredients.length) {
        const micro = tryMicrodata(html);
        if (micro.ingredients.length) {
            ingredients = micro.ingredients;
            if (!instructions.length) instructions = micro.instructions;
            servings = servings ?? micro.servings;
            warnings.push("Read from HTML microdata rather than JSON-LD.");
        }
    }

    if (!ingredients.length && !instructions.length) {
        return {
            ingredients: [],
            instructions: [],
            servings: null,
            sourcePath: "none",
            warnings: ["No recipe data found on this page — not as JSON-LD, embedded JSON, or microdata."],
        };
    }
    return { ingredients, instructions, servings, sourcePath: "json-ld", warnings };
}

export async function fetchAndParseRecipe(url: string): Promise<ExtractedRecipe> {
    const warnings: string[] = [];

    let html = "";
    try {
        const resp = await fetch(url, {
            headers: {
                // Many recipe sites block bare-fetch UAs.
                "User-Agent":
                    "Mozilla/5.0 (compatible; MaxBronMenu/1.0; +https://github.com/GibbHubb/Our_Menu)",
            },
        });
        if (!resp.ok) {
            return {
                ingredients: [],
                instructions: [],
                servings: null,
                sourcePath: "none",
                warnings: [`Source returned HTTP ${resp.status}`],
            };
        }
        html = await resp.text();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            ingredients: [],
            instructions: [],
            servings: null,
            sourcePath: "none",
            warnings: [`Could not fetch source URL: ${msg}`],
        };
    }

    // 1. JSON-LD path
    const jsonLd = tryJsonLd(html);
    let ingredients = jsonLd.ingredients;
    let instructions = jsonLd.instructions;
    let sourcePath: ExtractedRecipe["sourcePath"] = "none";
    if (ingredients.length || instructions.length) sourcePath = "json-ld";

    // 2. LLM path — only if JSON-LD missed something
    if (!ingredients.length || !instructions.length) {
        const llm = await extractWithLLM(url, html);
        if (llm) {
            if (!ingredients.length && llm.ingredients.length) {
                ingredients = llm.ingredients;
                sourcePath = sourcePath === "json-ld" ? "mixed" : "llm";
            }
            if (!instructions.length && llm.instructions.length) {
                instructions = llm.instructions;
                sourcePath = sourcePath === "json-ld" ? "mixed" : sourcePath === "none" ? "llm" : sourcePath;
            }
        } else if (!ingredients.length && !instructions.length) {
            warnings.push(
                "JSON-LD missing and LLM unreachable — no extraction performed.",
            );
        } else {
            warnings.push(
                "JSON-LD provided partial data; LLM unreachable for the rest.",
            );
        }
    }

    return { ingredients, instructions, servings: jsonLd.servings, sourcePath, warnings };
}

/** Convenience: format an ingredient list as the markdown shopping list shape. */
export function ingredientsToShoppingList(items: string[]): string {
    return items.map((i) => `- [ ] ${i}`).join("\n");
}

/** Convenience: format instructions as a numbered, newline-separated string. */
export function instructionsToText(items: string[]): string {
    return items.map((s, i) => `${i + 1}. ${s}`).join("\n");
}
