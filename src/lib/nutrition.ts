// OM11 — pure helpers for the nutrition feature. Claude call lives in
// /api/nutrition/[id] (server-only because of the API key).

import { createHash } from "node:crypto";

export interface NutritionEstimate {
    kcal_per_serving: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
}

/** Sha256 of normalised ingredients — lets the API skip Claude when the
 *  ingredient list hasn't changed since the last estimate. */
export function hashIngredients(raw: string | null | undefined): string {
    const normalised = (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
    return createHash("sha256").update(normalised).digest("hex");
}

export const NUTRITION_PROMPT = (title: string, ingredients: string, servings: number) => `You are a nutrition estimator helping a home cook get a rough macro snapshot for meal planning.

Recipe: ${title}
Servings: ${servings}
Ingredients:
${ingredients}

Estimate the **per-serving** nutrition for this recipe. Use realistic supermarket-portion assumptions when amounts are vague. Return ONLY valid JSON matching this schema — no markdown, no prose:
{
  "kcal_per_serving": <integer 50-1500>,
  "protein_g":        <integer 0-120>,
  "carbs_g":          <integer 0-200>,
  "fat_g":            <integer 0-120>
}`;

/** Validate + clamp Claude's JSON output. Returns null when the shape is wrong
 *  so callers can short-circuit to an error path without a try/catch. */
export function parseNutritionResponse(raw: string): NutritionEstimate | null {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(cleaned); } catch { return null; }
    const fields = ["kcal_per_serving", "protein_g", "carbs_g", "fat_g"] as const;
    const out: Partial<NutritionEstimate> = {};
    for (const k of fields) {
        const v = parsed[k];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
        out[k] = Math.round(v);
    }
    return out as NutritionEstimate;
}
