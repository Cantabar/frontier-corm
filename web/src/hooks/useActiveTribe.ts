/**
 * Active-tribe context: tracks which tribe the user has selected.
 *
 * Persists the selection in localStorage so it survives page refreshes.
 * Falls back to the first TribeCap if the stored value is stale.
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { TribeCapData } from "../lib/types";
import { useIdentity } from "./useIdentity";

const STORAGE_KEY = "frontier-lattice:activeTribeId";

export interface ActiveTribeState {
  /** Currently-selected tribe object ID */
  activeTribeId: string | null;
  /** TribeCap for the active tribe (enables write actions) */
  activeCap: TribeCapData | null;
  /** Switch the active tribe */
  setActiveTribeId: (id: string) => void;
}

export const ActiveTribeContext = createContext<ActiveTribeState>({
  activeTribeId: null,
  activeCap: null,
  setActiveTribeId: () => {},
});

export function useActiveTribe() {
  return useContext(ActiveTribeContext);
}

/**
 * Provider hook — call once in the app shell and pass the return value
 * to `ActiveTribeContext.Provider`.
 */
export function useActiveTribeResolver(): ActiveTribeState {
  const { tribeCaps } = useIdentity();

  const [activeTribeId, setRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Persist to localStorage on change
  const setActiveTribeId = useCallback((id: string) => {
    setRaw(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage quota / private browsing — ignore
    }
  }, []);

  // Ensure the stored tribe is still valid once caps load
  useEffect(() => {
    if (tribeCaps.length === 0) return;
    const valid = tribeCaps.some((c) => c.tribeId === activeTribeId);
    if (!valid) {
      setActiveTribeId(tribeCaps[0].tribeId);
    }
  }, [tribeCaps, activeTribeId, setActiveTribeId]);

  const activeCap = tribeCaps.find((c) => c.tribeId === activeTribeId) ?? null;

  return { activeTribeId, activeCap, setActiveTribeId };
}
