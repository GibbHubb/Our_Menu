import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // OM14 Phase A — PKCE so the magic-link callback receives `?code=`
    // instead of a hash fragment, which keeps the URL friendlier in logs
    // and survives an SSR-rendered callback page.
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
