/**
 * useCraftingStyle — persists the player's preferred crafting route.
 *
 * "field"  → prefer Field Refinery / Field Printer recipes (smaller batches, mobile).
 * "base"   → prefer Refinery / Heavy Refinery / Printer / Mini Printer / Heavy Printer (base-scale).
 *
 * Stored in localStorage so the preference survives page reloads.
 */

import { useState, useCallback } from "react";

export type CraftingStyle = "field" | "base";

const STORAGE_KEY = "frontier-corm:craftingStyle";

function readStored(): CraftingStyle {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "field" || v === "base") return v;
  } catch {
    /* ignore */
  }
  return "field";
}

export function useCraftingStyle() {
  const [craftingStyle, _set] = useState<CraftingStyle>(readStored);

  const setCraftingStyle = useCallback((style: CraftingStyle) => {
    _set(style);
    try {
      localStorage.setItem(STORAGE_KEY, style);
    } catch {
      /* ignore */
    }
  }, []);

  return { craftingStyle, setCraftingStyle } as const;
}
