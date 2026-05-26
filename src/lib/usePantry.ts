"use client";

// OM12 — small hook for components that want to know what's in the pantry.
// Single source of truth, no global store needed for one user.

import { useCallback, useEffect, useState } from "react";
import { getPantryItems, pantryKeySet, type PantryItem } from "./pantry";

export function usePantry() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const data = await getPantryItems();
    setItems(data);
    setLoaded(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, keys: pantryKeySet(items), loaded, refresh };
}
