"use client";

// OM14 Phase B — invite redemption.
//
// Accept runs client-side against the invitee's own authenticated session, so
// this flow needs nothing from OM14c (server-side session forwarding): a
// signed-out visitor is bounced to /login?next=/join/<code> and lands back
// here with a session the RPC can use.
//
// OM35(d) — joining and merging are now two steps.
//
// Accepting used to move every recipe, meal plan, collection and pantry item
// the joiner owned into the inviter's household and delete theirs. Because a
// leaver's rows stay with the household, that could not be undone by leaving:
// one click permanently transferred everything they had, disclosed only by a
// sentence of small print.
//
// Now accepting grants membership and switches where new recipes land, and
// nothing moves. If the joiner has a kitchen of their own we offer the merge
// afterwards, as a separate choice, with the actual counts in front of them.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ChefHat, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  acceptInvite,
  mergeHouseholdInto,
  mergePreviewIsEmpty,
  previewMerge,
  type MergePreview,
} from "@/lib/households";

// `joined` is the terminal state for a membership-only join. `offer_merge` is
// only reached when the joiner actually has something that could move.
type Phase = "idle" | "joining" | "joined" | "offer_merge" | "merging" | "failed";

/** "12 recipes, 3 meal plans" — omits the zeros so the sentence stays readable. */
function describe(rows: MergePreview[]): string {
  const total = (pick: (r: MergePreview) => number) =>
    rows.reduce((n, r) => n + pick(r), 0);
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(total((r) => r.recipes), "recipe", "recipes");
  add(total((r) => r.collections), "collection", "collections");
  add(total((r) => r.mealPlans), "meal plan", "meal plans");
  add(total((r) => r.pantryItems), "pantry item", "pantry items");
  add(total((r) => r.cookLog), "cook-log entry", "cook-log entries");
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === "string" ? params.code : "";
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MergePreview[]>([]);

  const checking = authLoading || !user;

  useEffect(() => {
    if (authLoading || user) return;
    router.replace(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  }, [authLoading, user, code, router]);

  const goHome = () => setTimeout(() => router.push("/"), 1200);

  const handleAccept = async () => {
    setPhase("joining");
    setError(null);
    try {
      const id = await acceptInvite(code);
      setHouseholdId(id);

      // Only interrupt the happy path when there is genuinely something to
      // decide about. A joiner with an empty kitchen just goes to the menu.
      const rows = await previewMerge(id);
      if (rows.length === 0 || mergePreviewIsEmpty(rows)) {
        setPhase("joined");
        goHome();
        return;
      }
      setPreview(rows);
      setPhase("offer_merge");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  const handleMerge = async () => {
    if (!householdId) return;
    setPhase("merging");
    setError(null);
    try {
      await mergeHouseholdInto(householdId);
      setPhase("joined");
      goHome();
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
              Your own kitchen stays exactly as it is. New recipes you add will go to
              this household from now on, and you can leave at any time.
            </p>
            <button
              onClick={() => void handleAccept()}
              className="w-full py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
            >
              Accept invite
            </button>
          </>
        )}

        {!checking && (phase === "joining" || phase === "merging") && (
          <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            {phase === "joining" ? "Joining…" : "Moving your recipes…"}
          </div>
        )}

        {!checking && phase === "offer_merge" && (
          <>
            <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>You&apos;re in. Nothing has moved.</span>
            </div>
            <p className="text-stone-600 text-sm leading-relaxed">
              You already have a kitchen of your own with{" "}
              <span className="font-medium text-stone-900">{describe(preview)}</span> in
              it. Would you like to bring it across?
            </p>
            <p className="text-stone-500 text-xs leading-relaxed">
              Bringing it across moves those into this household and closes your own
              one. <span className="font-medium text-stone-700">This can&apos;t be
              undone</span> — leaving later won&apos;t take them back out. You can also
              keep both and decide another time.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleMerge()}
                className="w-full py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
              >
                Bring my {describe(preview)} across
              </button>
              <button
                onClick={() => { setPhase("joined"); goHome(); }}
                className="w-full py-2.5 bg-stone-100 text-stone-700 rounded-lg text-sm font-semibold hover:bg-stone-200"
              >
                Keep them separate for now
              </button>
            </div>
          </>
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
