/**
 * GET /api/ai-status  →  { enabled: boolean, features: { chat, search, mealPlan, nutrition, receipts, substitutions } }
 *
 * OM35(c). Nutrition, Ask Chef, semantic search and AI meal plans have
 * returned 503 since the day they were written, because no key for the paid
 * SDKs they used has ever existed in any environment. Max's call,
 * 2026-08-25: leave the code in place, but stop pretending the features work.
 *
 * OM68: OPENAI_API_KEY dropped from the check. Personal work is free tier
 * only (Gemini), so that key must never be set; semantic search now runs on
 * GEMINI_API_KEY (src/lib/embeddings.ts) but stays behind this flag until the
 * flag is made per-feature.
 *
 * OM73: the last four routes on the old paid SDK (meal plan, nutrition,
 * receipts, substitutions) moved to Gemini, so the flag now keys on
 * GEMINI_API_KEY, the one key every AI feature uses.
 *
 * OM72: one flag per feature (src/lib/aiFeatures.ts). Each follows GEMINI_API_KEY and can be
 * switched off on its own with AI_DISABLE=search,nutrition (then Redeploy in Vercel). `enabled`
 * stays for pre-OM72 clients: true while any feature is on.
 *
 * The check is at runtime rather than build time on purpose — adding the key
 * in Vercel and redeploying turns every one of them back on with no code
 * change, which is the whole point of doing it this way rather than deleting.
 */

import { NextResponse } from "next/server";
import { aiStatusBody } from "@/lib/aiFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(
        aiStatusBody(),
        { headers: { "Cache-Control": "public, max-age=300" } },
    );
}
