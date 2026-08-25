"use client";

// OM35(c) — is there an LLM key behind the app at all?
//
// Every AI feature shares one answer, so ask once per page load and cache it
// in the module. `null` means "not known yet": callers should render nothing
// rather than flashing a "turned off" notice at someone whose key is fine.

import { useEffect, useState } from "react";

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchStatus(): Promise<boolean> {
    if (cached !== null) return cached;
    if (!inflight) {
        inflight = fetch("/api/ai-status")
            .then((r) => (r.ok ? r.json() : { enabled: false }))
            .then((j) => {
                cached = Boolean(j?.enabled);
                return cached;
            })
            .catch(() => {
                cached = false;
                return false;
            });
    }
    return inflight;
}

export function useAiEnabled(): boolean | null {
    const [enabled, setEnabled] = useState<boolean | null>(cached);

    useEffect(() => {
        let alive = true;
        void fetchStatus().then((v) => { if (alive) setEnabled(v); });
        return () => { alive = false; };
    }, []);

    return enabled;
}
