"use client";

// OM35(c) — is the AI behind a feature available at all?
// OM72 — per feature: `/api/ai-status` now answers `{ enabled, features }` and each entry point asks for
// its own flag, so one feature can be switched off (AI_DISABLE) without hiding the rest.
// OM74 — signed out is always off: every AI route needs a session.
//
// Asked once per page load and cached in the module. `null` means "not known yet": callers render
// nothing rather than flashing a "turned off" notice at someone whose key is fine.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { resolveAiFeature, type AiFeature } from "@/lib/aiFeatures";

type StatusBody = { enabled?: unknown; features?: Partial<Record<string, unknown>> };

let cached: StatusBody | null = null;
let inflight: Promise<StatusBody> | null = null;

async function fetchStatus(): Promise<StatusBody> {
    if (cached !== null) return cached;
    if (!inflight) {
        inflight = fetch("/api/ai-status")
            .then((r) => (r.ok ? r.json() : { enabled: false }))
            .then((j: unknown) => {
                cached = j && typeof j === "object" ? (j as StatusBody) : { enabled: false };
                return cached;
            })
            .catch(() => {
                cached = { enabled: false };
                return cached;
            });
    }
    return inflight;
}

/** Should this AI feature's entry point show? `null` until both the status and the session are known. */
export function useAiFeature(feature: AiFeature): boolean | null {
    const { user, loading } = useAuth();
    const [status, setStatus] = useState<StatusBody | null>(cached);

    useEffect(() => {
        let alive = true;
        void fetchStatus().then((v) => { if (alive) setStatus(v); });
        return () => { alive = false; };
    }, []);

    return resolveAiFeature(status, feature, loading ? null : Boolean(user));
}
