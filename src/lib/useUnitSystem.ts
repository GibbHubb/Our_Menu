"use client";

// OM27 — Tiny hook around the localStorage-backed unit-system pref.
// Re-renders any consumer when the pref changes in the same tab (custom
// event) or in another tab (storage event).

import { useEffect, useState, useCallback } from "react";
import { getUnitSystem, setUnitSystem, type UnitSystem } from "./unitConversion";

export function useUnitSystem(): [UnitSystem, (s: UnitSystem) => void] {
    const [system, setSystem] = useState<UnitSystem>("metric");

    useEffect(() => {
        setSystem(getUnitSystem());
        const onChange = () => setSystem(getUnitSystem());
        window.addEventListener("om27-unit-system-changed", onChange);
        window.addEventListener("storage", onChange);
        return () => {
            window.removeEventListener("om27-unit-system-changed", onChange);
            window.removeEventListener("storage", onChange);
        };
    }, []);

    const set = useCallback((s: UnitSystem) => {
        setUnitSystem(s);  // fires the custom event → setSystem above
    }, []);

    return [system, set];
}
