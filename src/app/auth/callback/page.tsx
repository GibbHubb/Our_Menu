"use client";

// OM14 Phase A — Magic-link callback. Supabase appends `?code=…` (PKCE) or
// hash-mode tokens after the user clicks the email link. We swap them for a
// session, then forward to the original destination. The AuthContext picks
// up the new session via onAuthStateChange and fires claim_orphan_data().

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function AuthCallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = search.get("next") || "/";
    const code = search.get("code");

    const finish = async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Hash-fragment legacy flow (older Supabase magic links): the JS
          // SDK reads the hash automatically on detectSessionInUrl, so just
          // make sure a session exists.
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) throw new Error("No session — link may have expired.");
        }
        router.replace(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    finish();
  }, [router, search]);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 max-w-sm w-full p-8 text-center space-y-3">
        {error ? (
          <>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-700">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-xl text-stone-900">Sign-in failed</h1>
            <p className="text-stone-600 text-sm">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-3 px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 text-stone-700">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <p className="text-stone-600 text-sm">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
