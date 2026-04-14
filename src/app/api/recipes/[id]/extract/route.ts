/**
 * POST /api/recipes/[id]/extract
 *
 * Fetches the recipe's external `link`, runs JSON-LD-then-LLM extraction
 * via `src/lib/recipeExtractor.ts`, and writes any *missing* fields back
 * to Supabase. Never overwrites existing content.
 *
 * Response shape:
 *   200 { ok: true, updated: ["ingredients","instructions","shopping_list"], recipe }
 *   400 { ok: false, error: "no link" }            // recipe has no link to extract from
 *   404 { ok: false, error: "not found" }           // recipe id missing
 *   422 { ok: false, error: "extractor returned nothing", warnings }
 *   500 { ok: false, error: "<message>" }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    extractJsonLdOnly,
    ingredientsToShoppingList,
    instructionsToText,
} from "@/lib/recipeExtractor";

export const runtime = "nodejs"; // we need fetch + JSON parsing on the server, not edge

function getServerSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error(
            "Supabase env not set (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
        );
    }
    return createClient(url, key);
}

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    if (!id) {
        return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { data: recipe, error: fetchErr } = await supabase
        .from("recipes")
        .select("id, title, link, ingredients, instructions, shopping_list")
        .eq("id", id)
        .single();

    if (fetchErr || !recipe) {
        return NextResponse.json(
            { ok: false, error: "not found", detail: fetchErr?.message },
            { status: 404 },
        );
    }
    if (!recipe.link) {
        return NextResponse.json(
            { ok: false, error: "recipe has no source link" },
            { status: 400 },
        );
    }

    let extracted;
    try {
        // Use JSON-LD-only path — safe for Vercel (no LAN LLM dependency).
        extracted = await extractJsonLdOnly(recipe.link);
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }

    if (!extracted.ingredients.length && !extracted.instructions.length) {
        return NextResponse.json(
            {
                ok: false,
                error: "extractor returned nothing",
                warnings: extracted.warnings,
                sourcePath: extracted.sourcePath,
            },
            { status: 422 },
        );
    }

    // Only fill empty fields — never overwrite existing user content.
    const updates: Record<string, string> = {};
    const updated: string[] = [];

    if (!recipe.ingredients?.trim() && extracted.ingredients.length) {
        updates.ingredients = extracted.ingredients.join("\n");
        updated.push("ingredients");
    }
    if (!recipe.instructions?.trim() && extracted.instructions.length) {
        updates.instructions = instructionsToText(extracted.instructions);
        updated.push("instructions");
    }
    if (!recipe.shopping_list?.trim() && extracted.ingredients.length) {
        updates.shopping_list = ingredientsToShoppingList(extracted.ingredients);
        updated.push("shopping_list");
    }

    if (!updated.length) {
        return NextResponse.json({
            ok: true,
            updated: [],
            note: "Recipe already has content — nothing overwritten.",
            sourcePath: extracted.sourcePath,
            warnings: extracted.warnings,
            recipe,
        });
    }

    const { data: written, error: writeErr } = await supabase
        .from("recipes")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

    if (writeErr) {
        return NextResponse.json(
            { ok: false, error: "supabase update failed", detail: writeErr.message },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        updated,
        sourcePath: extracted.sourcePath,
        warnings: extracted.warnings,
        recipe: written,
    });
}
