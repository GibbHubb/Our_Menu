"use client";

// OM27 — Tiny hook around the localStorage-backed unit-system pref.
// Re-renders any consumer when the pref changes in the same tab (custom
// event) or in another tab (storage event).
//
// OM62 — useSyncExternalStore instead of useEffect + setState: localStorage IS
// an external store, and this is React's hook for one. The server snapshot is
// 'metric', the same default the old initial state used, so hydration matches.

import { useCallback, useSyncExternalStore } from "react";
import { getUnitSystem, setUnitSystem, type UnitSystem } from "./unitConversion";

function subscribe(onChange: () => void): () => void {
    window.addEventListener("om27-unit-system-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener("om27-unit-system-changed", onChange);
        window.removeEventListener("storage", onChange);
    };
}

const serverSnapshot = (): UnitSystem => "metric";

export function useUnitSystem(): [UnitSystem, (s: UnitSystem) => void] {
    const system = useSyncExternalStore(subscribe, getUnitSystem, serverSnapshot);

    const set = useCallback((s: UnitSystem) => {
        setUnitSystem(s);  // fires the custom event → subscribers re-read
    }, []);

    return [system, set];
}
