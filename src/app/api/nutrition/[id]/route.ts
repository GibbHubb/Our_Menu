// OM11 — generate (or refresh) per-serving nutrition for a recipe.
// POST /api/nutrition/{recipeId}            ← cache-aware (skips if hash matches)
// POST /api/nutrition/{recipeId}?force=1    ← bypasses the hash dedupe
//
// Rate-limit: refuses to call Claude more than once per 60 s for the same recipe.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createRequestClient } from "@/lib/supabaseServer";
import { NUTRITION_PROMPT, hashIngredients, parseNutritionResponse } from "@/lib/nutrition";

const RATE_LIMIT_SECONDS = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing recipe id" }, { status: 400 });

    const force = req.nextUrl.searchParams.get("force") === "1";

    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
            { error: "Nutrition estimates aren't configured (ANTHROPIC_API_KEY missing)" },
            { status: 503 },
        );
    }

    // OM35(b): was a SERVICE-ROLE client bypassing RLS, so any guessed recipe
    // id was readable and writable. The caller's session now arrives via
    // apiFetch and RLS scopes it to their own household.
    const sb = createRequestClient(req);
    const { data: recipe, error: loadErr } = await sb
        .from("recipes")
        .select("id, title, ingredients, ingredients_hash, kcal_per_serving, nutrition_generated_at")
        .eq("id", id)
        .single();
    if (loadErr || !recipe) {
        return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    if (!recipe.ingredients || !recipe.ingredients.trim()) {
        return NextResponse.json({ error: "Recipe has no ingredients to analyse." }, { status: 422 });
    }

    // Rate limit: refuse if we generated within the last RATE_LIMIT_SECONDS.
    if (recipe.nutrition_generated_at) {
        const lastMs = Date.parse(recipe.nutrition_generated_at);
        if (!Number.isNaN(lastMs) && Date.now() - lastMs < RATE_LIMIT_SECONDS * 1000) {
            return NextResponse.json(
                { error: `Slow down — try again in ${Math.ceil((RATE_LIMIT_SECONDS * 1000 - (Date.now() - lastMs)) / 1000)} s.` },
                { status: 429 },
            );
        }
    }

    const newHash = hashIngredients(recipe.ingredients);
    if (!force && recipe.ingredients_hash === newHash && recipe.kcal_per_serving != null) {
        // Cache hit — skip Claude, return cached values from the row.
        return NextResponse.json({
            cached: true,
            kcal_per_serving: recipe.kcal_per_serving,
            ingredients_hash: recipe.ingredients_hash,
        });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let raw: string;
    try {
        const message = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            messages: [{
                role: "user",
                content: NUTRITION_PROMPT(recipe.title || "Untitled", recipe.ingredients, 4),
            }],
        });
        raw = (message.content[0] as { text: string }).text;
    } catch (err) {
        console.error("[OM11] Claude nutrition call failed:", err);
        return NextResponse.json({ error: "Could not reach the nutrition estimator." }, { status: 502 });
    }

    const parsed = parseNutritionResponse(raw);
    if (!parsed) {
        return NextResponse.json({ error: "Estimator returned an unexpected shape — try Regenerate.", raw }, { status: 502 });
    }

    const { error: updateErr } = await sb
        .from("recipes")
        .update({
            ...parsed,
            ingredients_hash: newHash,
            nutrition_generated_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (updateErr) {
        return NextResponse.json({ error: "Failed to persist nutrition." }, { status: 500 });
    }

    return NextResponse.json({
        cached: false,
        ...parsed,
        ingredients_hash: newHash,
    });
}
