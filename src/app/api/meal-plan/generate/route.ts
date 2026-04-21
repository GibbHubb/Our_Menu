// Requires: ANTHROPIC_API_KEY in .env.local
// Requires: 002_meal_plans.sql applied in Supabase

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
    const { pantry, dietary, days } = await req.json();

    // Get recipe titles + categories + ratings for context
    const { data: recipes } = await supabase.from('recipes').select('id, title, category, rating');

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
            return line;
        })
        .join('\n');

    const prompt = `You are a meal planner. Given a recipe library and user preferences, create a ${days}-day meal plan.

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
      "meal": "Meal name",
      "recipe_title": "exact title from library or null if new",
      "recipe_id": null,
      "reason": "brief reason"
    }
  ]
}

Prefer recipes from the library. For days where no library recipe fits, suggest a new simple meal.`;

    const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
    });

    const raw = (message.content[0] as { text: string }).text
        .replace(/```json\n?/g, '')
        .replace(/```/g, '')
        .trim();

    let plan;
    try {
        plan = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: 'Failed to parse meal plan', raw }, { status: 500 });
    }

    // Match recipe IDs by title
    const recipeMap = new Map((recipes ?? []).map(r => [r.title.toLowerCase(), r.id]));
    plan.days = plan.days.map((d: { recipe_title?: string; [key: string]: unknown }) => ({
        ...d,
        recipe_id: d.recipe_title
            ? (recipeMap.get(d.recipe_title.toLowerCase()) ?? null)
            : null,
    }));

    return NextResponse.json({ plan });
}
