import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // OM14 Phase A used PKCE for a friendlier `?code=` callback URL. PKCE
    // stashes a code verifier in THIS browser's localStorage, so the emailed
    // link only works in the browser that requested it — tap it from the Gmail
    // app or another device and you get "PKCE code verifier not found in
    // storage". Cookie-based storage does not fix that; it is still per-browser.
    // Implicit returns the tokens in the URL hash instead, so a magic link
    // works from any device. The callback handles both (auth/callback/page.tsx).
    flowType: 'implicit',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
