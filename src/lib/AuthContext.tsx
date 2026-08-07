"use client";

// OM14 Phase A — Auth context.
//
// Wraps the app with the current Supabase session + a `useAuth()` hook.
// On first sign-in the context fires `claim_orphan_data()` exactly once per
// session so anonymous data created before auth landed gets assigned to the
// new user. Subsequent renders/sessions are no-ops.

import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

interface AuthState {
  session: Session | null;
  user:    User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  session: null,
  user:    null,
  loading: true,
  signOut: async () => {},
});

// OM14 Phase B — bumped v1 → v2 deliberately.
//
// The v1 flag was written in a `finally`, so a failing claim burned its one
// chance and never retried. Migration 010's claim_orphan_data() did fail (an
// ambiguous `table_name` reference — repaired in 016), which means every
// browser carrying a v1 flag recorded a claim that never happened. A new key
// gives the repaired function exactly one honest attempt per user.
const CLAIM_KEY = "om-claim-fired-v2";

async function maybeClaimOrphans(uid: string) {
  if (typeof window === "undefined") return;
  const fired = localStorage.getItem(`${CLAIM_KEY}:${uid}`);
  if (fired) return;
  try {
    const { data, error } = await supabase.rpc("claim_orphan_data");
    if (error) {
      // Function might not exist yet (migration 010/016 not run) — fail silent
      // so the user still gets a working logged-in session, and leave the flag
      // unset so the next load retries.
      console.warn("claim_orphan_data:", error.message);
      return;
    }
    if (Array.isArray(data)) {
      const total = data.reduce((s: number, r: { claimed_count?: number }) =>
        s + (r.claimed_count ?? 0), 0);
      if (total > 0) console.info(`Claimed ${total} orphan rows for ${uid}`);
    }
    // Only a genuinely successful claim is recorded as done.
    localStorage.setItem(`${CLAIM_KEY}:${uid}`, "1");
  } catch (e) {
    console.warn("claim_orphan_data threw:", e);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user.id) maybeClaimOrphans(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user.id) maybeClaimOrphans(s.user.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // Don't clear claim flag — re-signing the same uid shouldn't re-claim.
  };

  return (
    <AuthCtx.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
