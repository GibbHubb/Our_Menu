// Requires: GEMINI_API_KEY (OM73: moved off the paid SDK; Gemini vision via src/lib/llm.ts)

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabaseServer';
import { llmConfigured, llmJson } from '@/lib/llm';

// JSON mode needs a top-level object, so the model wraps the list; the UI still gets { items }.
const RECEIPT_PROMPT =
    'Extract all grocery items from this receipt. Return ONLY JSON, no other text:\n{"items": [{"name": "Item name", "quantity": "1"}, ...]}\nIf this is not a receipt, return: {"items": []}';

export async function POST(req: NextRequest) {
    // OM55 — signed-in callers only. This route calls a paid/LLM backend (or fetches an arbitrary
    // URL) on the caller's behalf; anonymous callers could burn it or probe with it.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    if (!llmConfigured()) {
        return NextResponse.json({ error: 'Receipt scanning is not configured (GEMINI_API_KEY missing)' }, { status: 503 });
    }
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    let json: unknown;
    let raw: string;
    try {
        ({ json, raw } = await llmJson({ prompt: RECEIPT_PROMPT, image: { base64, mimeType }, maxTokens: 4096 }));
    } catch (err) {
        console.error('[OM73] receipt scan LLM call failed:', err);
        return NextResponse.json({ error: 'Could not reach the receipt scanner.' }, { status: 502 });
    }
    if (json === undefined) {
        return NextResponse.json({ error: 'Could not parse items', raw }, { status: 422 });
    }

    // { items: [...] } as asked, or a bare array if the model ignored the wrapper.
    const items = Array.isArray(json) ? json : (json as { items?: unknown } | null)?.items;
    return NextResponse.json({ items: Array.isArray(items) ? items : [] });
}
