"use client";

// OM14 Phase A — Magic-link callback. Supabase appends `?code=…` (PKCE) or
// hash-mode tokens after the user clicks the email link. We swap them for a
// session, then forward to the original destination. The AuthContext picks
// up the new session via onAuthStateChange and fires claim_orphan_data().

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  markPasswordOfferDismissed, markPasswordOfferTaken, shouldOfferPassword,
} from "@/lib/password";

function AuthCallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // OM48 — the one moment offering a password is actually useful: they just
  // paid the cost of not having one. Shown at most once per person per
  // browser (see lib/password.ts), and never in the way of getting in.
  const [offer, setOffer] = useState<{ next: string; userId: string } | null>(null);

  useEffect(() => {
    const next = search.get("next") || "/";
    const code = search.get("code");

    const finish = async () => {
      try {
        if (code) {
          // Legacy PKCE links already sitting in an inbox. Their verifier lives
          // in whichever browser asked for them, so this fails on any other
          // device — say what to do about it instead of quoting the SDK.
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw new Error(
              "This link was sent before a sign-in fix and only works in the browser that requested it. Request a fresh link — the new one works anywhere."
            );
          }
        } else {
          // Implicit flow (the default since the PKCE cross-device failure):
          // Supabase puts the tokens — or an error — in the URL hash. The SDK
          // reads it on detectSessionInUrl, and getSession() awaits that, so a
          // session here means the link was good.
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const hashError = hash.get("error_description") || hash.get("error");
          if (hashError) throw new Error(hashError.replace(/\+/g, " "));

          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) throw new Error("No session — the link may have expired. Sign-in links are valid for 1 hour.");
        }
        // Signed in either way by here. Ask about a password before moving
        // on — but only once, and never for someone who has already answered.
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (uid && shouldOfferPassword(uid)) {
          setOffer({ next, userId: uid });
          return;
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
        ) : offer ? (
          <>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700">
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-xl text-stone-900">You&apos;re in</h1>
            <p className="text-stone-600 text-sm leading-relaxed">
              Want a password? Then next time you can sign in straight away instead of
              waiting for an email.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  // Carry `next` through. Someone arriving from an invite link
                  // has next=/join/<code>, and dropping it here would sign them
                  // in without ever redeeming the invite — they would land in
                  // their own empty household instead of the one they were
                  // invited to. The household page offers Continue afterwards.
                  markPasswordOfferTaken(offer.userId);
                  router.replace(
                    `/households?next=${encodeURIComponent(offer.next)}#password`,
                  );
                }}
                className="px-4 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
              >
                Set a password
              </button>
              <button
                onClick={() => {
                  markPasswordOfferDismissed(offer.userId);
                  router.replace(offer.next);
                }}
                className="px-4 py-2 text-stone-500 text-sm hover:text-stone-900"
              >
                Not now
              </button>
            </div>
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
