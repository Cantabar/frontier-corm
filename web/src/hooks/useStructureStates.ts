/**
 * Manages the per-facility-type structure availability state for the Forge Planner.
 *
 * Derives default states from on-chain AssemblyData (structures connected to the
 * selected network node), then lets the user override individual entries with a
 * manual 3-state toggle: "missing" | "offline" | "online".
 *
 * Overrides are reset whenever the selected network node changes.
 */

import { useState, useMemo, useEffect } from "react";
import type { AssemblyData, StructureState } from "../lib/types";
import type { BlueprintEntry } from "./useBlueprints";

export type { StructureState };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStructureStates(
  selectedNodeId: string | null,
  structures: AssemblyData[],
  blueprints: BlueprintEntry[],
): {
  /** Effective state per facilityTypeId (on-chain defaults merged with overrides). */
  structureStates: Map<number, StructureState>;
  /** Manual overrides set by the user. */
  overrides: Map<number, StructureState>;
  /** Set a manual override for a facility type. */
  setOverride: (facilityTypeId: number, state: StructureState) => void;
  /** Clear all manual overrides (revert to on-chain defaults). */
  resetOverrides: () => void;
  /** Unique facility types that appear across all blueprints. */
  facilityTypes: Array<{ facilityTypeId: number; facilityName: string }>;
} {
  const [overrides, setOverrides] = useState<Map<number, StructureState>>(new Map());

  // Reset overrides whenever the selected node changes.
  useEffect(() => {
    setOverrides(new Map());
  }, [selectedNodeId]);

  // Derive unique facility types from all blueprints.
  const facilityTypes = useMemo(() => {
    const seen = new Map<number, string>();
    for (const bp of blueprints) {
      for (const f of bp.facilities) {
        if (!seen.has(f.facilityTypeId)) {
          seen.set(f.facilityTypeId, f.facilityName);
        }
      }
    }
    return [...seen.entries()]
      .map(([facilityTypeId, facilityName]) => ({ facilityTypeId, facilityName }))
      .sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [blueprints]);

  // Build on-chain defaults: for each facility type, check structures at the selected node.
  const onChainDefaults = useMemo((): Map<number, StructureState> => {
    const map = new Map<number, StructureState>();
    if (!selectedNodeId) return map;

    // Structures connected to this node.
    const atNode = structures.filter((s) => s.energySourceId === selectedNodeId);

    for (const { facilityTypeId } of facilityTypes) {
      const matches = atNode.filter((s) => s.typeId === facilityTypeId);
      if (matches.length === 0) {
        map.set(facilityTypeId, "missing");
      } else if (matches.some((s) => s.status === "Online")) {
        map.set(facilityTypeId, "online");
      } else {
        map.set(facilityTypeId, "offline");
      }
    }

    return map;
  }, [selectedNodeId, structures, facilityTypes]);

  // Merge on-chain defaults with manual overrides.
  const structureStates = useMemo((): Map<number, StructureState> => {
    const merged = new Map<number, StructureState>(onChainDefaults);
    for (const [typeId, state] of overrides) {
      merged.set(typeId, state);
    }
    return merged;
  }, [onChainDefaults, overrides]);

  function setOverride(facilityTypeId: number, state: StructureState) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(facilityTypeId, state);
      return next;
    });
  }

  function resetOverrides() {
    setOverrides(new Map());
  }

  return { structureStates, overrides, setOverride, resetOverrides, facilityTypes };
}
