// Requires: GEMINI_API_KEY (OM73: moved off the paid SDK; Gemini vision via src/lib/llm.ts)

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabaseServer';
import { llmConfigured, llmFailure, llmJson } from '@/lib/llm';

// Vision on a long receipt can take a while; the LLM call itself aborts at 45 s (src/lib/llm.ts).
export const maxDuration = 60;

/** Formats Gemini takes as inline image data over the OpenAI-compatible endpoint (HEIC/HEIF unverified there). */
const RECEIPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Under Vercel's 4.5 MB request-body cap, so an oversized photo gets this JSON 413, not a platform error. */
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

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
    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
    }
    const file = formData.get('image');
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    // OM73 — an unknown or missing type is refused rather than guessed as JPEG.
    const mimeType = file.type.toLowerCase();
    if (!RECEIPT_IMAGE_TYPES.includes(mimeType)) {
        return NextResponse.json({ error: 'Use a JPEG, PNG or WebP photo.' }, { status: 415 });
    }
    if (file.size > MAX_RECEIPT_BYTES) {
        return NextResponse.json({ error: 'That photo is too large (max 4 MB). Try a smaller one.' }, { status: 413 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    let json: unknown;
    let raw: string;
    try {
        ({ json, raw } = await llmJson({ prompt: RECEIPT_PROMPT, image: { base64, mimeType }, maxTokens: 4096 }));
    } catch (err) {
        console.error('[OM73] receipt scan LLM call failed:', err);
        const { status, error } = llmFailure(err, 'receipt scanner');
        return NextResponse.json({ error }, { status });
    }
    if (json === undefined) {
        return NextResponse.json({ error: 'Could not parse items', raw }, { status: 422 });
    }

    // { items: [...] } as asked, or a bare array if the model ignored the wrapper.
    const items = Array.isArray(json) ? json : (json as { items?: unknown } | null)?.items;
    return NextResponse.json({ items: Array.isArray(items) ? items : [] });
}
