// OM14c — per-request Supabase clients for API routes.
//
// The problem this replaces
// -------------------------
// Route handlers imported the *browser* singleton from `@/lib/supabaseClient`
// — a module-level client created with `persistSession: true` and shared
// across every server request in the process. That is wrong twice over:
//
//   1. It carries no caller identity, so RLS evaluates as the anonymous role
//      and inserts land with a NULL user_id (the OM14c symptom).
//   2. A singleton with session persistence is process-global state on the
//      server; one request's auth state is visible to the next.
//
// Approach
// --------
// The browser stores its session in localStorage (supabase-js default), which
// a server route cannot read. Rather than migrate the whole app to cookie
// storage via @supabase/ssr — that rewrites the PKCE magic-link flow and
// AuthContext, and would need browser verification to land safely — the
// client forwards its access token in an Authorization header and each route
// builds a short-lived client bound to that token. RLS then evaluates as the
// caller, and `auth.uid()` resolves correctly inside policies.
//
// Migrating to @supabase/ssr cookie sessions remains the more idiomatic
// end-state; this gets user-scoping working without touching how users log in.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

/** Pull the bearer token off an incoming request, if the caller sent one. */
export function getAccessToken(req: Request): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * A request-scoped client that acts as the calling user.
 *
 * Always uses the anon key — never the service role — so Row Level Security
 * still applies. When the caller sent no token the client is simply
 * anonymous, which preserves the previous behaviour for unauthenticated use
 * rather than hard-failing.
 *
 * `persistSession: false` matters: this client must never write to any shared
 * store on the server.
 */
export function createRequestClient(req: Request): SupabaseClient {
  const token = getAccessToken(req);
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}

/**
 * The authenticated user behind this request, or null when anonymous.
 *
 * Verifies the token against Supabase rather than decoding it locally — a
 * client-supplied JWT is untrusted input, and only the auth server can say
 * whether it is valid and unexpired.
 */
export async function getRequestUser(req: Request) {
  const token = getAccessToken(req);
  if (!token) return null;
  const { data, error } = await createRequestClient(req).auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

/**
 * Service-role client for genuinely administrative work that must bypass RLS
 * (e.g. the batch embedding job over every recipe).
 *
 * Falls back to the anon key when SUPABASE_SERVICE_ROLE_KEY is absent, which
 * matches what the nutrition and extract routes already did. Never hand this
 * client a caller-supplied token — it ignores RLS by design.
 */
export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON_KEY;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
