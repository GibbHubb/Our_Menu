"use client";

// OM14 Phase B — household management.
//
// One household, its members, and a share-code invite link. Multi-household
// switching is deliberately out of scope (plan §4): for two people sharing a
// recipe box, "your household" is unambiguous.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, Copy, Home, KeyRound, Loader2, LogOut, Pencil, UserPlus, Users, AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { PASSWORD_MIN, markPasswordSet } from "@/lib/password";
import {
  createInvite, ensureHousehold, getMyHousehold, inviteUrl, leaveHousehold,
  listMembers, renameHousehold, type Household, type HouseholdMember,
} from "@/lib/households";

export default function HouseholdsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers]     = useState<HouseholdMember[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [code, setCode]       = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [copied, setCopied]   = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  // OM48 — your own sign-in, not the household's.
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  // Where to send them once they are done — set when the magic-link offer
  // routed them here mid-journey (an invite is the case that matters).
  const [continueTo, setContinueTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First visit for a user who signed in before 016 landed: create the
      // household (and adopt their existing rows) rather than showing an
      // empty shell they can't do anything with.
      let h = await getMyHousehold();
      if (!h) {
        await ensureHousehold();
        h = await getMyHousehold();
      }
      setHousehold(h);
      setMembers(await listMembers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login?next=/households"); return; }
    void load();
  }, [authLoading, user, router, load]);

  // OM48 — arriving at /households?next=…#password from the sign-in offer.
  //
  // Read off `window` rather than useSearchParams: this is a client-only
  // page and useSearchParams would drag a Suspense boundary in with it.
  //
  // The hash cannot do its own scrolling here — this page renders a spinner
  // while it loads, so `id="password"` does not exist when the browser
  // applies the hash, and it never retries. Scroll it ourselves once the
  // element is really on the page.
  useEffect(() => {
    if (loading || authLoading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next");
    if (raw && /^\/(?!\/)/.test(raw)) setContinueTo(raw);
    if (window.location.hash !== "#password") return;
    const el = document.getElementById("password");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("pw-new")?.focus({ preventScroll: true });
  }, [loading, authLoading]);

  const handleInvite = async () => {
    setMinting(true);
    setError(null);
    setCopied(false);
    try {
      setCode(await createInvite());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMinting(false);
    }
  };

  const handleSetPassword = async () => {
    if (pwSaving) return; // Enter can fire this faster than the button disables
    setPwError(null);
    if (pw1.length < PASSWORD_MIN) {
      setPwError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (pw1 !== pw2) {
      setPwError("Those two don't match.");
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      markPasswordSet(user?.id);
      setPwDone(true);
      setPw1("");
      setPw2("");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : String(e));
    } finally {
      setPwSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions) — the link is
      // on screen and selectable, so this is a nicety, not a failure path.
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  };

  const handleRename = async () => {
    if (!household) return;
    const name = draftName.trim();
    if (!name || name === household.name) { setRenaming(false); return; }
    if (await renameHousehold(household.id, name)) {
      setHousehold({ ...household, name });
    } else {
      setError("Couldn't rename the household.");
    }
    setRenaming(false);
  };

  const handleLeave = async () => {
    if (!household) return;
    if (!confirm(
      `Leave "${household.name}"?\n\nRecipes you added stay with the household — ` +
      `you won't be able to see them afterwards.`
    )) return;
    if (await leaveHousehold(household.id)) {
      router.push("/");
    } else {
      setError("Couldn't leave the household.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 text-stone-500 hover:bg-stone-100 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-serif text-2xl text-stone-900">Household</h1>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Household name ───────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-1">
          <div className="flex items-center gap-2 text-stone-400">
            <Home className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Your kitchen</span>
          </div>
          {renaming ? (
            <div className="flex items-center gap-2 pt-1">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); }}
                className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
              <button
                onClick={() => void handleRename()}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
              >
                Save
              </button>
              <button
                onClick={() => setRenaming(false)}
                className="px-3 py-2 text-stone-500 text-sm hover:text-stone-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl text-stone-900">{household?.name ?? "—"}</h2>
              <button
                onClick={() => { setDraftName(household?.name ?? ""); setRenaming(true); }}
                className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full"
                title="Rename household"
                aria-label="Rename household"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-stone-500 text-sm pt-1">
            Everyone here shares the same recipes, shopping lists, pantry and meal plans.
          </p>
        </section>

        {/* ── Members ──────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-4">
          <div className="flex items-center gap-2 text-stone-400">
            <Users className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Members ({members.length})
            </span>
          </div>
          <ul className="divide-y divide-stone-100">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="text-sm text-stone-900 truncate">
                    {m.email ?? m.user_id}
                    {m.user_id === user?.id && (
                      <span className="text-stone-400 font-normal"> — you</span>
                    )}
                  </p>
                  <p className="text-xs text-stone-400">
                    joined {new Date(m.joined_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  m.role === "owner"
                    ? "bg-amber-50 text-amber-800 border border-amber-100"
                    : "bg-stone-100 text-stone-600"
                }`}>
                  {m.role}
                </span>
              </li>
            ))}
            {!members.length && (
              <li className="py-3 text-sm text-stone-400">No members yet.</li>
            )}
          </ul>
        </section>

        {/* ── Invite ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-4">
          <div className="flex items-center gap-2 text-stone-400">
            <UserPlus className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Invite someone</span>
          </div>
          <p className="text-stone-600 text-sm leading-relaxed">
            Generate a link and send it however you like. They sign in with their own
            email first, then open the link to join. Links last 7 days and work once.
          </p>

          {code ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 truncate select-all">
                  {inviteUrl(code)}
                </code>
                <button
                  onClick={() => void handleCopy()}
                  className="px-3 py-2 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                onClick={() => void handleInvite()}
                className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
              >
                Generate a different link
              </button>
            </div>
          ) : (
            <button
              onClick={() => void handleInvite()}
              disabled={minting}
              className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800 disabled:opacity-60 flex items-center gap-2"
            >
              {minting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create invite link
            </button>
          )}
        </section>

        {/* ── Your password ────────────────────────────────────────────
            OM48. This is the only place in the app a password can be set.
            Before it existed, the two that worked had been set by an admin
            script and a new member had a login form they could never
            satisfy. Note this is your sign-in, not the household's — it is
            on this page because this is where "you" already lives. */}
        <section id="password" className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-4">
          <div className="flex items-center gap-2 text-stone-400">
            <KeyRound className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Your password</span>
          </div>

          {pwDone ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Saved. You can sign in with <span className="font-medium">{user?.email}</span> and
                  that password from now on — no email needed.
                </span>
              </div>
              <div className="flex items-center gap-3">
                {continueTo && (
                  <button
                    onClick={() => router.replace(continueTo)}
                    className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800"
                  >
                    Continue
                  </button>
                )}
                <button
                  onClick={() => { setPwDone(false); setPwError(null); }}
                  className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
                >
                  Change it again
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-stone-600 text-sm leading-relaxed">
                Set one and you can sign in without waiting for an email. Changing it here
                replaces the old one everywhere.
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="pw-new" className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    New password
                  </label>
                  <input
                    id="pw-new"
                    type="password"
                    autoComplete="new-password"
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    placeholder={`At least ${PASSWORD_MIN} characters`}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="pw-confirm" className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Again
                  </label>
                  <input
                    id="pw-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSetPassword(); }}
                    placeholder="Type it once more"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              {pwError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{pwError}</span>
                </div>
              )}
              <button
                onClick={() => void handleSetPassword()}
                disabled={pwSaving || !pw1 || !pw2}
                className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800 disabled:opacity-60 flex items-center gap-2"
              >
                {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save password
              </button>
            </>
          )}
        </section>

        {/* ── Leave ────────────────────────────────────────────────────── */}
        <section className="pb-8">
          <button
            onClick={() => void handleLeave()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50 border border-red-200 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            Leave this household
          </button>
        </section>
      </div>
    </div>
  );
}
