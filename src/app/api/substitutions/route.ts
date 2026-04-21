// Requires: ANTHROPIC_API_KEY in .env.local

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

interface Substitution {
    name: string;
    note: string;
}

export async function POST(req: NextRequest) {
    const { ingredient, recipeName, recipeIngredients } = await req.json();

    if (!ingredient) {
        return NextResponse.json({ error: 'ingredient is required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'Substitutions are not configured (ANTHROPIC_API_KEY missing)' }, { status: 503 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
        });

        const raw = (message.content[0] as { text: string }).text
            .replace(/```json\n?/g, '')
            .replace(/```/g, '')
            .trim();

        const parsed = JSON.parse(raw) as { substitutions: Substitution[] };
        if (!Array.isArray(parsed.substitutions)) {
            return NextResponse.json({ error: 'Unexpected response format', raw }, { status: 500 });
        }

        return NextResponse.json({ substitutions: parsed.substitutions });
    } catch (err) {
        console.error('Substitution error:', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get substitutions' }, { status: 500 });
    }
}
