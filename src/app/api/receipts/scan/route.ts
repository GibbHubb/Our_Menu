// Requires: ANTHROPIC_API_KEY in .env.local

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mediaType = (file.type || 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp';

    const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: base64 },
                    },
                    {
                        type: 'text',
                        text: 'Extract all grocery items from this receipt. Return ONLY a JSON array, no other text:\n[{"name": "Item name", "quantity": "1"}, ...]\nIf this is not a receipt, return: []',
                    },
                ],
            },
        ],
    });

    const raw = (message.content[0] as { text: string }).text
        .replace(/```json\n?/g, '')
        .replace(/```/g, '')
        .trim();

    let items;
    try {
        items = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: 'Could not parse items', raw }, { status: 422 });
    }

    return NextResponse.json({ items: Array.isArray(items) ? items : [] });
}
