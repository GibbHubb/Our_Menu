"use client";

// OM47 — password sign-in.
//
// The magic link works, but it is a bad daily door: it costs a round trip
// through an inbox every single time, the project mailer allows only two
// sends an hour, and on a phone the link opens Safari rather than the
// home-screen app. A password + the phone's keychain is one tap.
//
// The link flow stays — it is the recovery path when the password is
// forgotten, and it is how a new person joins — but it is no longer the
// first thing the page asks for.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, ChefHat, Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

type Mode = "password" | "link";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  // `next` is attacker-controllable — it is whatever is in the query string,
  // and it is used for router.push, <Link href> and the magic link's
  // emailRedirectTo. A value like `https://evil.example` or `//evil.example`
  // would walk a just-authenticated user straight off the real origin, so
  // only a plain in-app path is accepted.
  const rawNext = search.get("next") || "/";
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";
  const { user, signOut } = useAuth();

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Don't navigate until the session is genuinely in hand. The guards on
      // /shopping and /households bounce anyone they see as `!loading &&
      // !user`, so arriving a tick early lands you back on this page.
      // `replace`, not `push` — the back button should not return to a login
      // form you have already passed (the magic-link callback does the same).
      if (!data.session) throw new Error("Signed in, but no session came back. Try again.");
      router.replace(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /invalid login credentials/i.test(msg)
          // OM48 — this fires for two different people: someone who mistyped,
          // and someone who has never had a password at all (every account
          // before OM47 was created by a magic link, which sets none). Say
          // both, or the second one reads it as "you are not allowed in".
          ? "That email and password don't match. If you have never set one, use the sign-in link below — you can set a password straight after."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      // OM39(c) — Supabase's built-in mailer allows 2 sign-in emails per hour
      // for the whole project. The raw error says "email rate limit exceeded",
      // which reads like a fault rather than "wait, and don't keep clicking".
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /rate limit/i.test(msg)
          ? "We can only send two sign-in emails an hour. Check your inbox (and spam) for one already sent — otherwise try again a little later."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 max-w-md w-full p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl text-stone-900">You're signed in</h1>
          <p className="text-stone-600 text-sm">
            Logged in as <span className="font-medium text-stone-900">{user.email}</span>
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={() => router.push(next)}
              className="px-5 py-2 bg-stone-900 text-white rounded-full text-sm font-semibold hover:bg-stone-800"
            >
              Go to menu
            </button>
            <button
              onClick={async () => { await signOut(); }}
              className="px-5 py-2 bg-stone-100 text-stone-700 rounded-full text-sm font-semibold hover:bg-stone-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const emailField = (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
        Email
      </label>
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        autoFocus
      />
    </div>
  );

  const errorBox = error && (
    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{error}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
      <Link href={next} className="absolute top-4 left-4 p-2 text-stone-500 hover:bg-stone-100 rounded-full">
        <ArrowLeft className="w-5 h-5" />
      </Link>

      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 max-w-md w-full p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-900 rounded-full">
            <ChefHat className="w-5 h-5 text-stone-50" />
          </div>
          <h1 className="font-serif text-2xl text-stone-900">Sign in to Max &amp; Bron</h1>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePassword} className="space-y-4">
            <p className="text-stone-600 text-sm leading-relaxed">
              Enter your email and password. Your phone can remember them, so next
              time it's one tap.
            </p>
            {emailField}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            {errorBox}
            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="w-full py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchTo("link")}
              className="w-full text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
            >
              New here, or forgotten it? Email me a sign-in link instead
            </button>
          </form>
        ) : sent ? (
          <div className="space-y-3 text-center py-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700">
              <Mail className="w-6 h-6" />
            </div>
            <p className="text-stone-700 text-sm leading-relaxed">
              Check <span className="font-semibold text-stone-900">{email}</span> for a sign-in link.
            </p>
            <p className="text-stone-400 text-xs">
              The link expires in 1 hour. Close this tab — the link opens its own.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <p className="text-stone-600 text-sm leading-relaxed">
              We'll email you a link — no password to remember. Use the same email next time
              and you'll see the same recipes.
            </p>
            {emailField}
            {errorBox}
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full py-2.5 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Send sign-in link
            </button>
            <button
              type="button"
              onClick={() => switchTo("password")}
              className="w-full text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
            >
              Use a password instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
      <LoginInner />
    </Suspense>
  );
}
