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
    recipeIngredient?: string | string[];
    recipeInstructions?:
        | string
        | string[]
        | Array<{ "@type"?: string; text?: string; name?: string }>;
}

function findRecipeNode(obj: unknown): JsonLdRecipe | null {
    if (!obj) return null;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findRecipeNode(item);
            if (found) return found;
        }
        return null;
    }
    if (typeof obj === "object") {
        const o = obj as JsonLdRecipe;
        const t = o["@type"];
        if (
            t === "Recipe" ||
            (Array.isArray(t) && t.includes("Recipe"))
        ) {
            return o;
        }
        if (o["@graph"]) return findRecipeNode(o["@graph"]);
    }
    return null;
}

function normaliseInstructions(
    raw: JsonLdRecipe["recipeInstructions"],
): string[] {
    if (!raw) return [];
    if (typeof raw === "string") {
        // Some sites cram all steps into one string with newlines / numbers.
        return raw
            .split(/\n|(?<=[.!?])\s{2,}|^\s*\d+\.\s+/m)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (Array.isArray(raw)) {
        return raw
            .map((item) => {
                if (typeof item === "string") return item.trim();
                if (item && typeof item === "object") {
                    return (item.text || item.name || "").toString().trim();
                }
                return "";
            })
            .filter(Boolean);
    }
    return [];
}

function tryJsonLd(html: string): { ingredients: string[]; instructions: string[] } {
    const out = { ingredients: [] as string[], instructions: [] as string[] };
    const re = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            const recipe = findRecipeNode(data);
            if (!recipe) continue;
            if (recipe.recipeIngredient) {
                const raw = recipe.recipeIngredient;
                const list = Array.isArray(raw) ? raw : [raw];
                out.ingredients = list.map((i) => String(i).trim()).filter(Boolean);
            }
            if (recipe.recipeInstructions) {
                out.instructions = normaliseInstructions(recipe.recipeInstructions);
            }
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
            sourcePath: "none",
            warnings: [`Could not fetch source URL: ${msg}`],
        };
    }

    const { ingredients, instructions } = tryJsonLd(html);
    if (!ingredients.length && !instructions.length) {
        return {
            ingredients: [],
            instructions: [],
            sourcePath: "none",
            warnings: ["No JSON-LD Recipe block found on this page."],
        };
    }
    return {
        ingredients,
        instructions,
        sourcePath: "json-ld",
        warnings: [],
    };
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

    return { ingredients, instructions, sourcePath, warnings };
}

/** Convenience: format an ingredient list as the markdown shopping list shape. */
export function ingredientsToShoppingList(items: string[]): string {
    return items.map((i) => `- [ ] ${i}`).join("\n");
}

/** Convenience: format instructions as a numbered, newline-separated string. */
export function instructionsToText(items: string[]): string {
    return items.map((s, i) => `${i + 1}. ${s}`).join("\n");
}
