/**
 * OM72 — one flag per AI feature.
 *
 * `/api/ai-status` used to answer a single `{ enabled }`, so the only switch was the Gemini key: all on or
 * all off. Each feature now has its own flag. Every one is Gemini-backed today, so each is
 * `GEMINI_API_KEY set && not listed in AI_DISABLE`; a feature on some other backend later only changes
 * `aiFeatureFlags` here.
 *
 * `AI_DISABLE` is a comma-separated list of feature names (`AI_DISABLE=search,nutrition`), case and
 * spaces ignored, unknown names ignored, `all` turns every feature off. It is read at request time, so
 * changing it in Vercel and pressing Redeploy (Vercel applies env changes to new deployments only)
 * switches a feature with no code change. `/api/ai-status` is cached for 5 minutes.
 *
 * This module is shared by the routes (server guard: a disabled feature answers 503 and never calls
 * Gemini) and the client hook (the UI hides the entry point), so the two can never disagree on names.
 */

export const AI_FEATURES = ['chat', 'search', 'mealPlan', 'nutrition', 'receipts', 'substitutions'] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export type AiFeatureFlags = Record<AiFeature, boolean>;

/** The environment variables read here (process.env in the app; a plain object in tests). */
type Env = Record<string, string | undefined>;

export interface AiStatus {
    /** Back-compat (pre-OM72 clients): true while at least one feature is on. */
    enabled: boolean;
    features: AiFeatureFlags;
}

/** The features named in `AI_DISABLE`. */
export function disabledAiFeatures(raw: string | undefined = process.env.AI_DISABLE): Set<AiFeature> {
    const names = (raw ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (names.includes('all')) return new Set(AI_FEATURES);
    return new Set(AI_FEATURES.filter((f) => names.includes(f.toLowerCase())));
}

/** Every feature's flag from the current environment. */
export function aiFeatureFlags(env: Env = process.env): AiFeatureFlags {
    const gemini = Boolean(env.GEMINI_API_KEY?.trim());
    const off = disabledAiFeatures(env.AI_DISABLE);
    return Object.fromEntries(AI_FEATURES.map((f) => [f, gemini && !off.has(f)])) as AiFeatureFlags;
}

/** Server guard: is this feature on right now? A route answers 503 without calling out when it is not. */
export function aiFeatureEnabled(feature: AiFeature, env: Env = process.env): boolean {
    return aiFeatureFlags(env)[feature];
}

/** The `/api/ai-status` body. */
export function aiStatusBody(env: Env = process.env): AiStatus {
    const features = aiFeatureFlags(env);
    return { enabled: Object.values(features).some(Boolean), features };
}

/**
 * Client side: should this feature's entry point show?
 *
 * `status` null means "not known yet" and stays null so nothing flashes. Signed out is always false
 * (OM74: every AI route needs a session, so a signed-out button could only answer "Sign in to use this.").
 * A pre-OM72 `{ enabled }` response with no `features` (a cached answer during a deploy) applies
 * `enabled` to every feature.
 */
export function resolveAiFeature(
    status: { enabled?: unknown; features?: Partial<Record<string, unknown>> } | null,
    feature: AiFeature,
    signedIn: boolean | null,
): boolean | null {
    if (signedIn === false) return false;
    if (status === null || signedIn === null) return null;
    if (status.features && typeof status.features === 'object') return status.features[feature] === true;
    return status.enabled === true;
}

/**
 * Server guard with its 503 message: null while the feature is on, else why it is off.
 * `subject` is the start of the sentence, e.g. "Substitutions are".
 */
export function aiFeatureOffError(feature: AiFeature, subject: string, env: Env = process.env): string | null {
    if (!env.GEMINI_API_KEY?.trim()) return `${subject} not configured (GEMINI_API_KEY missing)`;
    if (disabledAiFeatures(env.AI_DISABLE).has(feature)) return `${subject} switched off on this deployment.`;
    return null;
}

/**
 * OM72 review — who may run the embed sync (`/api/recipes/embed`). The Supabase project is shared with
 * other apps' users, and `?admin=1` is only a UI switch, so the route checks this server-side.
 * `AI_ADMIN_USER_IDS` is a comma-separated list of Supabase auth user ids; empty or unset = nobody.
 */
export function isAiAdmin(userId: string | null | undefined, env: Env = process.env): boolean {
    if (!userId) return false;
    const ids = (env.AI_ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return ids.includes(userId);
}
