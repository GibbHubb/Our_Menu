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

const CLAIM_KEY = "om-claim-fired-v1";

async function maybeClaimOrphans(uid: string) {
  if (typeof window === "undefined") return;
  const fired = localStorage.getItem(`${CLAIM_KEY}:${uid}`);
  if (fired) return;
  try {
    const { data, error } = await supabase.rpc("claim_orphan_data");
    if (error) {
      // Function might not exist yet (migration 010 not run) — fail silent
      // so the user still gets a working logged-in session.
      console.warn("claim_orphan_data:", error.message);
    } else if (Array.isArray(data)) {
      const total = data.reduce((s: number, r: { claimed_count?: number }) =>
        s + (r.claimed_count ?? 0), 0);
      if (total > 0) console.info(`Claimed ${total} orphan rows for ${uid}`);
    }
  } catch (e) {
    console.warn("claim_orphan_data threw:", e);
  } finally {
    localStorage.setItem(`${CLAIM_KEY}:${uid}`, "1");
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
