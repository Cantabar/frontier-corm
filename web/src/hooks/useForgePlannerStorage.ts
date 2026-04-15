/**
 * useForgePlannerStorage — persists forge planner session state to localStorage.
 *
 * Persisted state:
 *  - selectedTypeId + quantity  (the active blueprint)
 *  - selectedNodeId             (the active network node)
 *  - ssuByNode                  (per-node SSU inventory enabled + selected IDs)
 *  - overridesByNode            (per-node facility-type override map)
 *
 * Follows the same try/catch pattern as useCraftingStyle — never throws, silently
 * ignores read/write errors (e.g. private browsing mode, storage quota exceeded).
 */

import { useRef, useCallback } from "react";
import type { StructureState } from "./useStructureStates";

const STORAGE_KEY = "frontier-corm:forge-planner";

interface ForgePlannerStorageData {
  selectedTypeId: number | null;
  quantity: string;
  selectedNodeId: string | null;
  ssuByNode: Record<string, { enabled: boolean; ids: string[] }>;
  overridesByNode: Record<string, [number, StructureState][]>;
}

const DEFAULT_STORAGE: ForgePlannerStorageData = {
  selectedTypeId: null,
  quantity: "1",
  selectedNodeId: null,
  ssuByNode: {},
  overridesByNode: {},
};

function readStored(): ForgePlannerStorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STORAGE };
    const parsed = JSON.parse(raw) as Partial<ForgePlannerStorageData>;
    return {
      selectedTypeId: typeof parsed.selectedTypeId === "number" ? parsed.selectedTypeId : null,
      quantity: typeof parsed.quantity === "string" && parsed.quantity.length > 0 ? parsed.quantity : "1",
      selectedNodeId: typeof parsed.selectedNodeId === "string" ? parsed.selectedNodeId : null,
      ssuByNode: parsed.ssuByNode && typeof parsed.ssuByNode === "object" ? parsed.ssuByNode : {},
      overridesByNode: parsed.overridesByNode && typeof parsed.overridesByNode === "object" ? parsed.overridesByNode : {},
    };
  } catch {
    return { ...DEFAULT_STORAGE };
  }
}

function writeStored(data: ForgePlannerStorageData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function useForgePlannerStorage() {
  const storeRef = useRef<ForgePlannerStorageData>(readStored());

  const persistBlueprint = useCallback((typeId: number | null, quantity: string) => {
    storeRef.current = { ...storeRef.current, selectedTypeId: typeId, quantity };
    writeStored(storeRef.current);
  }, []);

  const persistNodeId = useCallback((nodeId: string | null) => {
    storeRef.current = { ...storeRef.current, selectedNodeId: nodeId };
    writeStored(storeRef.current);
  }, []);

  const persistSsuState = useCallback(
    (nodeId: string, enabled: boolean, selectedIds: Set<string>) => {
      const ssuByNode = {
        ...storeRef.current.ssuByNode,
        [nodeId]: { enabled, ids: [...selectedIds] },
      };
      storeRef.current = { ...storeRef.current, ssuByNode };
      writeStored(storeRef.current);
    },
    [],
  );

  const persistOverrides = useCallback(
    (nodeId: string, overrides: Map<number, StructureState>) => {
      const overridesByNode = {
        ...storeRef.current.overridesByNode,
        [nodeId]: [...overrides.entries()],
      };
      storeRef.current = { ...storeRef.current, overridesByNode };
      writeStored(storeRef.current);
    },
    [],
  );

  const getSsuForNode = useCallback(
    (nodeId: string) => storeRef.current.ssuByNode[nodeId],
    [],
  );

  const getOverridesForNode = useCallback(
    (nodeId: string): [number, StructureState][] | undefined =>
      storeRef.current.overridesByNode[nodeId],
    [],
  );

  return {
    /** Initial snapshot — read once on mount, use for useState initialisers. */
    initial: storeRef.current,
    getSsuForNode,
    getOverridesForNode,
    persistBlueprint,
    persistNodeId,
    persistSsuState,
    persistOverrides,
  } as const;
}
