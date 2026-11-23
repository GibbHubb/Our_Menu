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
        // OM72 review — only a good answer is cached. A failed fetch (offline, a blip) reads as "off"
        // for this mount only, and the next mount asks again instead of hiding AI for the session.
        inflight = fetch("/api/ai-status")
            .then(async (r) => {
                if (!r.ok) throw new Error(`ai-status HTTP ${r.status}`);
                const j: unknown = await r.json();
                if (!j || typeof j !== "object") throw new Error("ai-status: not an object");
                cached = j as StatusBody;
                return cached;
            })
            .catch((): StatusBody => {
                inflight = null;
                return { enabled: false };
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
