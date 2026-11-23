// Requires: GEMINI_API_KEY (OM73: moved off the paid SDK; personal work is Gemini free tier only)
// Requires: 002_meal_plans.sql applied in Supabase

import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';
import { currentSeason } from '@/lib/seasons';
import { llmFailure, llmJson } from '@/lib/llm';
import { aiFeatureOffError } from '@/lib/aiFeatures';
import { fixMealNames } from '@/lib/mealPlan';

// A 14-day plan can take Gemini a while; the LLM call itself aborts at 45 s (src/lib/llm.ts).
export const maxDuration = 60;

const MAX_PLAN_DAYS = 14;

/** Plan length from the request, clamped to 1..MAX_PLAN_DAYS; 7 (the UI default) when missing or junk. */
function clampPlanDays(raw: unknown): number {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return 7;
    return Math.min(MAX_PLAN_DAYS, Math.max(1, n));
}

export async function POST(req: NextRequest) {
    // OM73 — signed-in callers only, like the sibling AI routes (OM55): this spends the Gemini quota.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    const off = aiFeatureOffError('mealPlan', 'Meal plans are');  // OM72
    if (off) return NextResponse.json({ error: off }, { status: 503 });
    let body: { pantry?: unknown; dietary?: unknown; days?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { pantry, dietary } = body ?? {};
    const days = clampPlanDays(body?.days);

    // OM14c — read as the caller so recipes and cook_log are their own rows
    // once those tables are user-scoped, not the anonymous view of them.
    const supabase = createRequestClient(req);

    // Get recipe titles + categories + ratings + seasons for context (OM13)
    const { data: recipes } = await supabase.from('recipes').select('id, title, category, rating, seasons');
    const season = currentSeason();

    // OM7 — exclude recipes cooked in the last 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCooks } = await supabase
        .from('cook_log')
        .select('recipe_id')
        .gte('cooked_at', threeDaysAgo);
    const recentlyCookedIds = new Set((recentCooks ?? []).map((r) => r.recipe_id));

    const availableRecipes = (recipes ?? []).filter((r) => !recentlyCookedIds.has(r.id));
    const recipeContext = availableRecipes
        .map(r => {
            const cats = Array.isArray(r.category) ? r.category.join(', ') : r.category;
            let line = `- ${r.title}${cats ? ` (${cats})` : ''}`;
            if (r.rating && r.rating >= 4) line += ` [rated ${r.rating}/5 - preferred]`;
            else if (r.rating && r.rating <= 2) line += ` [rated ${r.rating}/5 - try to avoid]`;
            // OM13 — surface season tags so the model can bias correctly
            const seasonsArr = Array.isArray(r.seasons) ? r.seasons : [];
            if (seasonsArr.length) {
                const inSeason = seasonsArr.includes(season);
                line += ` [seasons: ${seasonsArr.join('/')}${inSeason ? ' — IN SEASON' : ' — out of season'}]`;
            }
            return line;
        })
        .join('\n');

    const prompt = `You are a meal planner. Given a recipe library and user preferences, create a ${days}-day meal plan.

Current season: ${season}. Lean toward recipes tagged as IN SEASON (or year-round) when picking; penalise out-of-season picks unless the user specifically asks for one or the rest of the library has nothing better. Year-round recipes are always fair game.

Recipe library:
${recipeContext}

User preferences:
- Pantry items available: ${pantry || 'not specified'}
- Dietary requirement: ${dietary || 'none'}
- Plan length: ${days} days

Return ONLY valid JSON matching this schema exactly:
{
  "days": [
    {
      "day": 1,
      "meal": "Dish name, e.g. Lamb Curry",
      "recipe_title": "exact title from library or null if new",
      "recipe_id": null,
      "reason": "brief reason"
    }
  ]
}

Rules for "meal": it is the name of the DISH being cooked (for example "Lamb Curry" or "Chicken Stir-fry"), never the meal type. Do not write "Breakfast", "Lunch", "Dinner", "Snack" or any other meal-time word as the "meal" value. When you pick a library recipe, "meal" is that recipe's title.

Prefer recipes from the library. For days where no library recipe fits, suggest a new simple meal.`;

    let json: unknown;
    let raw: string;
    try {
        ({ json, raw } = await llmJson({ prompt, maxTokens: 4096 }));
    } catch (err) {
        console.error('[OM73] meal plan LLM call failed:', err);
        const { status, error } = llmFailure(err, 'meal planner');
        return NextResponse.json({ error }, { status });
    }

    const plan = json as { days?: unknown } | undefined;
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.days)) {
        return NextResponse.json({ error: 'Failed to parse meal plan', raw }, { status: 500 });
    }

    // Match recipe IDs by title
    const recipeMap = new Map((recipes ?? []).map(r => [r.title.toLowerCase(), r.id]));
    // OM74 — a `meal` that is only a meal type ("Lunch") becomes the dish name.
    plan.days = fixMealNames(plan.days as { meal?: unknown; recipe_title?: unknown; [key: string]: unknown }[]).map((d) => ({
        ...d,
        recipe_id: typeof d.recipe_title === 'string' && d.recipe_title
            ? (recipeMap.get(d.recipe_title.toLowerCase()) ?? null)
            : null,
    }));

    return NextResponse.json({ plan });
}
