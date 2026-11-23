// Requires: GEMINI_API_KEY (OM73: moved off the paid SDK; personal work is Gemini free tier only)

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabaseServer';
import { LlmError, llmConfigured, llmFailure, llmJson } from '@/lib/llm';

interface Substitution {
    name: string;
    note: string;
}

export async function POST(req: NextRequest) {
    // OM55 — signed-in callers only. This route calls a paid/LLM backend (or fetches an arbitrary
    // URL) on the caller's behalf; anonymous callers could burn it or probe with it.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    const { ingredient, recipeName, recipeIngredients } = await req.json();

    if (!ingredient) {
        return NextResponse.json({ error: 'ingredient is required' }, { status: 400 });
    }

    if (!llmConfigured()) {
        return NextResponse.json({ error: 'Substitutions are not configured (GEMINI_API_KEY missing)' }, { status: 503 });
    }

    const prompt = `You are a chef's assistant helping someone cook without a key ingredient.

Recipe: ${recipeName || 'unnamed'}
${recipeIngredients ? `Other ingredients in the recipe:\n${recipeIngredients}\n` : ''}
Missing ingredient: ${ingredient}

Suggest exactly 2-3 realistic substitutions for the missing ingredient, considering the recipe context.
For each substitute, include a brief (1 sentence) note on how it affects the dish or how to adjust.

Return ONLY valid JSON matching this schema — no markdown, no prose:
{
  "substitutions": [
    { "name": "substitute name", "note": "brief impact note" }
  ]
}`;

    try {
        const { json, raw } = await llmJson({ prompt, maxTokens: 1024 });

        const parsed = json as { substitutions?: Substitution[] } | undefined;
        if (!parsed || !Array.isArray(parsed.substitutions)) {
            return NextResponse.json({ error: 'Unexpected response format', raw }, { status: 500 });
        }

        return NextResponse.json({ substitutions: parsed.substitutions });
    } catch (err) {
        console.error('Substitution error:', err);
        if (err instanceof LlmError) {
            const { status, error } = llmFailure(err, 'substitution helper');
            return NextResponse.json({ error }, { status });
        }
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get substitutions' }, { status: 500 });
    }
}
