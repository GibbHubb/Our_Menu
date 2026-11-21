/**
 * GET /api/ai-status  →  { enabled: boolean }
 *
 * OM35(c). Nutrition, Ask Chef, semantic search and AI meal plans have
 * returned 503 since the day they were written, because no ANTHROPIC_API_KEY
 * or OPENAI_API_KEY has ever existed in any environment. Max's call,
 * 2026-08-25: leave the code in place, but stop pretending the features work.
 *
 * OM68: OPENAI_API_KEY dropped from the check. Personal work is free tier
 * only (Gemini), so that key must never be set; semantic search now runs on
 * GEMINI_API_KEY (src/lib/embeddings.ts) but stays behind this flag until the
 * flag is made per-feature.
 *
 * The check is at runtime rather than build time on purpose — adding the key
 * in Vercel and redeploying turns every one of them back on with no code
 * change, which is the whole point of doing it this way rather than deleting.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const enabled = Boolean(
        process.env.ANTHROPIC_API_KEY?.trim(),
    );
    return NextResponse.json(
        { enabled },
        { headers: { "Cache-Control": "public, max-age=300" } },
    );
}
