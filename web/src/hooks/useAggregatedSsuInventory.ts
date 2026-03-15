/**
 * Hook for aggregating inventory across multiple Smart Storage Units.
 *
 * Fetches the owner-slot inventory for each selected SSU in parallel and
 * merges the results into a single Map<typeId, totalQuantity> — the exact
 * `Inventory` type that useOptimizer expects.
 */

import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import type { AssemblyData } from "../lib/types";
import type { Inventory } from "./useOptimizer";
import type { InventoryItemEntry } from "./useSsuInventory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AggregatedSsuInventoryResult {
  /** Merged inventory: typeId → total quantity across all selected SSUs. */
  inventory: Inventory;
  /** Per-SSU breakdown (for UI display). */
  perSsu: { ssuId: string; ssuName: string; items: InventoryItemEntry[] }[];
  /** Number of SSUs that were successfully fetched. */
  ssuCount: number;
  /** Total unique item types across all SSUs. */
  uniqueTypeCount: number;
  isLoading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Helpers (mirrored from useSsuInventory — kept local to avoid coupling)
// ---------------------------------------------------------------------------

function parseInventoryItems(itemsField: unknown): InventoryItemEntry[] {
  if (!itemsField || typeof itemsField !== "object") return [];

  const outer = itemsField as { fields?: { contents?: unknown[] } };
  const contents = outer?.fields?.contents ?? (itemsField as { contents?: unknown[] }).contents;
  if (!Array.isArray(contents)) return [];

  return contents.map((entry) => {
    const e = (entry as { fields?: Record<string, unknown> }).fields ?? (entry as Record<string, unknown>);
    const value = (e.value as { fields?: Record<string, unknown> })?.fields ?? (e.value as Record<string, unknown>);
    return {
      typeId: Number(e.key ?? value?.type_id ?? 0),
      itemId: Number(value?.item_id ?? 0),
      volume: Number(value?.volume ?? 0),
      quantity: Number(value?.quantity ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch and aggregate inventory across multiple SSUs.
 *
 * Only reads the **owner** inventory slot of each SSU (the slot keyed by
 * ownerCapId). Open-storage and player slots are excluded since the tribe
 * doesn't own those materials.
 *
 * @param ssus     - Array of SSU AssemblyData objects to include
 * @param enabled  - Master toggle; set false to skip all fetches
 */
export function useAggregatedSsuInventory(
  ssus: AssemblyData[],
  enabled = true,
): AggregatedSsuInventoryResult {
  const client = useSuiClient();

  // Stable query key based on sorted SSU IDs
  const ssuIds = ssus.map((s) => s.id).sort();

  const { data, isLoading, error } = useQuery({
    queryKey: ["aggregatedSsuInventory", ssuIds],
    queryFn: async () => {
      const results: { ssuId: string; ssuName: string; items: InventoryItemEntry[] }[] = [];

      // Fetch all SSUs in parallel
      const fetches = ssus.map(async (ssu) => {
        const items: InventoryItemEntry[] = [];
        try {
          const dfResult = await client.getDynamicFields({ parentId: ssu.id });

          for (const df of dfResult.data) {
            const nameValue = (df.name as { value?: string }).value ?? String(df.name);
            const nameType = (df.name as { type?: string }).type ?? "";
            if (!nameType.includes("ID") && !nameType.includes("address")) continue;

            // Only read the owner inventory slot
            if (nameValue !== ssu.ownerCapId) continue;

            const obj = await client.getDynamicFieldObject({
              parentId: ssu.id,
              name: df.name,
            });
            const content = obj.data?.content as { fields?: Record<string, unknown> } | undefined;
            const fields = content?.fields;
            const innerFields =
              (fields?.value as { fields?: Record<string, unknown> })?.fields ??
              (fields?.value as Record<string, unknown>) ??
              fields;
            if (!innerFields || typeof innerFields !== "object") continue;
            if (!("max_capacity" in innerFields) || !("items" in innerFields)) continue;

            items.push(...parseInventoryItems(innerFields.items));
          }
        } catch {
          // If one SSU fails, we still aggregate the rest
        }

        return { ssuId: ssu.id, ssuName: ssu.name, items };
      });

      const settled = await Promise.all(fetches);
      results.push(...settled);

      // Merge into a single inventory map
      const inventory: Inventory = new Map();
      for (const entry of results) {
        for (const item of entry.items) {
          inventory.set(item.typeId, (inventory.get(item.typeId) ?? 0) + item.quantity);
        }
      }

      return { inventory, perSsu: results };
    },
    enabled: enabled && ssus.length > 0,
    // Refetch every 60s while the panel is open
    refetchInterval: 60_000,
  });

  const inventory = data?.inventory ?? new Map<number, number>();
  const perSsu = data?.perSsu ?? [];

  return {
    inventory,
    perSsu,
    ssuCount: perSsu.filter((s) => s.items.length > 0).length,
    uniqueTypeCount: inventory.size,
    isLoading,
    error: error as Error | null,
  };
}
