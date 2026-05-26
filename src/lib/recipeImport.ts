// OM10 — recipe-from-URL parser. Pure functions only — no fetch, no DOM,
// no Next/Node dependencies. The API route at /api/import-url handles the
// actual HTTP fetch + SSRF guard, then calls `parseRecipeHtml(html, url)`.

export type ImportSource = "json-ld" | "open-graph" | "mixed" | "none";

export interface RecipeImportResult {
    title: string | null;
    image_url: string | null;
    ingredients: string[] | null;
    instructions: string[] | null;
    servings: number | null;
    source_url: string;
    source: ImportSource;
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

const JSONLD_BLOCK_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractJsonLdBlocks(html: string): unknown[] {
    const blocks: unknown[] = [];
    let m: RegExpExecArray | null;
    JSONLD_BLOCK_RE.lastIndex = 0;
    while ((m = JSONLD_BLOCK_RE.exec(html)) !== null) {
        const raw = m[1].trim();
        if (!raw) continue;
        try {
            blocks.push(JSON.parse(raw));
        } catch {
            // Some sites emit JSON with trailing commas / HTML-escapes; try
            // a softer pass before giving up.
            const cleaned = raw.replace(/,(\s*[}\]])/g, "$1");
            try { blocks.push(JSON.parse(cleaned)); } catch { /* skip */ }
        }
    }
    return blocks;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
    if (!node || typeof node !== "object") return false;
    const t = (node as { "@type"?: unknown })["@type"];
    if (typeof t === "string") return t === "Recipe";
    if (Array.isArray(t)) return t.includes("Recipe");
    return false;
}

function findRecipeNode(blocks: unknown[]): Record<string, unknown> | null {
    const visit = (val: unknown): Record<string, unknown> | null => {
        if (Array.isArray(val)) {
            for (const item of val) {
                const found = visit(item);
                if (found) return found;
            }
            return null;
        }
        if (val && typeof val === "object") {
            if (isRecipeNode(val)) return val;
            // Schema.org pages often nest the Recipe in @graph[].
            const obj = val as Record<string, unknown>;
            if (Array.isArray(obj["@graph"])) {
                const found = visit(obj["@graph"]);
                if (found) return found;
            }
        }
        return null;
    };
    return visit(blocks);
}

function unwrapImage(image: unknown): string | null {
    if (!image) return null;
    if (typeof image === "string") return image;
    if (Array.isArray(image)) {
        for (const i of image) {
            const u = unwrapImage(i);
            if (u) return u;
        }
        return null;
    }
    if (typeof image === "object") {
        const obj = image as Record<string, unknown>;
        if (typeof obj.url === "string") return obj.url;
        if (typeof obj["@id"] === "string") return obj["@id"] as string;
    }
    return null;
}

function asStringArray(value: unknown): string[] | null {
    if (!value) return null;
    if (typeof value === "string") {
        // Some recipes pack instructions as a single big string with newlines.
        return value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(value)) return null;
    const out: string[] = [];
    for (const item of value) {
        if (typeof item === "string") {
            const t = item.trim();
            if (t) out.push(t);
        } else if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const text = obj.text ?? obj.name;
            if (typeof text === "string" && text.trim()) out.push(text.trim());
        }
    }
    return out.length ? out : null;
}

function asServings(yieldVal: unknown): number | null {
    if (!yieldVal) return null;
    if (typeof yieldVal === "number") return yieldVal;
    const candidates: string[] = [];
    if (typeof yieldVal === "string") candidates.push(yieldVal);
    if (Array.isArray(yieldVal)) {
        for (const v of yieldVal) if (typeof v === "string") candidates.push(v);
    }
    for (const c of candidates) {
        const m = c.match(/\d+/);
        if (m) {
            const n = parseInt(m[0], 10);
            if (!Number.isNaN(n) && n > 0 && n < 1000) return n;
        }
    }
    return null;
}

function fromJsonLdRecipe(node: Record<string, unknown>): Partial<RecipeImportResult> {
    return {
        title: typeof node.name === "string" ? node.name.trim() : null,
        image_url: unwrapImage(node.image),
        ingredients: asStringArray(node.recipeIngredient),
        instructions: asStringArray(node.recipeInstructions),
        servings: asServings(node.recipeYield),
    };
}

// ---------------------------------------------------------------------------
// OpenGraph fallback
// ---------------------------------------------------------------------------

const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /(\w+(?::\w+)?)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;

function parseMetaTags(html: string): Record<string, string> {
    const tags: Record<string, string> = {};
    let m: RegExpExecArray | null;
    META_TAG_RE.lastIndex = 0;
    while ((m = META_TAG_RE.exec(html)) !== null) {
        const tag = m[0];
        const attrs: Record<string, string> = {};
        let a: RegExpExecArray | null;
        ATTR_RE.lastIndex = 0;
        while ((a = ATTR_RE.exec(tag)) !== null) {
            attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
        }
        const key = (attrs.property || attrs.name || "").toLowerCase();
        const value = attrs.content;
        if (key && value && !(key in tags)) tags[key] = value;
    }
    return tags;
}

function fromOpenGraph(html: string): Partial<RecipeImportResult> {
    const meta = parseMetaTags(html);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return {
        title: meta["og:title"] || (titleMatch ? titleMatch[1].trim() : null),
        image_url: meta["og:image"] || meta["twitter:image"] || null,
    };
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export function parseRecipeHtml(html: string, sourceUrl: string): RecipeImportResult {
    const result: RecipeImportResult = {
        title: null, image_url: null, ingredients: null, instructions: null,
        servings: null, source_url: sourceUrl, source: "none",
    };

    let usedJsonLd = false;
    const blocks = extractJsonLdBlocks(html);
    const recipeNode = findRecipeNode(blocks);
    if (recipeNode) {
        const parsed = fromJsonLdRecipe(recipeNode);
        Object.assign(result, parsed);
        usedJsonLd = true;
    }

    // OG fills any blanks left by JSON-LD (or runs on its own when JSON-LD absent).
    const og = fromOpenGraph(html);
    let usedOg = false;
    if (!result.title && og.title) { result.title = og.title; usedOg = true; }
    if (!result.image_url && og.image_url) { result.image_url = og.image_url; usedOg = true; }

    if (usedJsonLd && usedOg) result.source = "mixed";
    else if (usedJsonLd) result.source = "json-ld";
    else if (usedOg) result.source = "open-graph";
    else result.source = "none";

    return result;
}
