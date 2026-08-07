"use client";

// OM14 Phase B — invite redemption.
//
// Accept runs client-side against the invitee's own authenticated session, so
// this flow needs nothing from OM14c (server-side session forwarding): a
// signed-out visitor is bounced to /login?next=/join/<code> and lands back
// here with a session the RPC can use.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ChefHat, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { acceptInvite } from "@/lib/households";

// Only the accept action carries state. Whether we're still checking auth is
// derived from the auth context rather than mirrored into an effect — copying
// it in would be a cascading setState (and the lint rule is right about it).
type Phase = "idle" | "joining" | "joined" | "failed";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === "string" ? params.code : "";
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const checking = authLoading || !user;

  useEffect(() => {
    if (authLoading || user) return;
    router.replace(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  }, [authLoading, user, code, router]);

  const handleAccept = async () => {
    setPhase("joining");
    setError(null);
    try {
      await acceptInvite(code);
      setPhase("joined");
      // Give the confirmation a beat to register before the menu loads.
      setTimeout(() => router.push("/"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 max-w-md w-full p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-900 rounded-full">
            <ChefHat className="w-5 h-5 text-stone-50" />
          </div>
          <h1 className="font-serif text-2xl text-stone-900">Join a household</h1>
        </div>

        {checking && (
          <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking your invite…
          </div>
        )}

        {!checking && phase === "idle" && (
          <>
            <p className="text-stone-600 text-sm leading-relaxed">
              You&apos;re signed in as{" "}
              <span className="font-medium text-stone-900">{user?.email}</span>. Accepting
              joins you to this household — you&apos;ll share its recipes, shopping lists,
              pantry and meal plans.
            </p>
            <p className="text-stone-500 text-xs leading-relaxed">
              Anything already in your own kitchen moves across with you, so nothing is
              lost. If you leave later, the recipes stay with the household.
            </p>
            <button
              onClick={() => void handleAccept()}
              className="w-full py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
            >
              Accept invite
            </button>
          </>
        )}

        {!checking && phase === "joining" && (
          <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Joining…
          </div>
        )}

        {!checking && phase === "joined" && (
          <div className="space-y-3 text-center py-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-stone-700 text-sm">You&apos;re in — taking you to the menu.</p>
          </div>
        )}

        {!checking && phase === "failed" && (
          <>
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void handleAccept()}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
              >
                Try again
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-semibold hover:bg-stone-200"
              >
                Back to menu
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
