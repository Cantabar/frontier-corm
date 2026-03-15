/**
 * Hook for filtering active contracts by a specific SSU and determining
 * which ones the current user can fulfill based on their SSU inventory.
 */

import { useMemo } from "react";
import { useActiveContracts } from "./useContracts";
import type { TrustlessContractData } from "../lib/types";
import type { InventoryItemEntry } from "./useSsuInventory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractsForSsuResult {
  /** Contracts the user can fulfill with their current SSU inventory (sorted by match quality). */
  fulfillableContracts: TrustlessContractData[];
  /** Remaining contracts associated with this SSU that the user cannot currently fulfill. */
  otherContracts: TrustlessContractData[];
  /** All contracts for this SSU (fulfillable first). */
  allContracts: TrustlessContractData[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the SSU IDs a contract is associated with (source and/or destination). */
function contractSsuIds(c: TrustlessContractData): string[] {
  const ct = c.contractType;
  switch (ct.variant) {
    case "CoinForItem":
      return [ct.destinationSsuId];
    case "ItemForCoin":
      return [ct.sourceSsuId];
    case "ItemForItem":
      return [ct.sourceSsuId, ct.destinationSsuId];
    case "Transport":
      return [ct.sourceSsuId, ct.destinationSsuId];
    case "CoinForCoin":
    default:
      return [];
  }
}

/** Check whether the user's inventory satisfies a contract's wanted items. */
function canFulfillContract(
  contract: TrustlessContractData,
  inventoryByType: Map<number, number>,
): boolean {
  const ct = contract.contractType;
  const remaining =
    Number(contract.targetQuantity) - Number(contract.filledQuantity);
  if (remaining <= 0) return false;

  switch (ct.variant) {
    case "CoinForItem": {
      const available = inventoryByType.get(ct.wantedTypeId) ?? 0;
      return available > 0 && available >= Math.min(ct.wantedQuantity, remaining);
    }
    case "ItemForItem": {
      const available = inventoryByType.get(ct.wantedTypeId) ?? 0;
      return available > 0 && available >= Math.min(ct.wantedQuantity, remaining);
    }
    case "Transport": {
      const available = inventoryByType.get(ct.itemTypeId) ?? 0;
      return available > 0 && available >= Math.min(ct.itemQuantity, remaining);
    }
    // CoinForCoin and ItemForCoin don't require items from the user
    case "CoinForCoin":
    case "ItemForCoin":
      return false;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch active contracts filtered to a specific SSU, split into fulfillable
 * and non-fulfillable based on the user's SSU inventory.
 *
 * @param ssuId     - The SSU object ID to filter contracts for
 * @param inventory - The user's inventory items from that SSU
 */
export function useContractsForSsu(
  ssuId: string | undefined,
  inventory: InventoryItemEntry[],
): ContractsForSsuResult {
  const { contracts, isLoading, error, refetch } = useActiveContracts();

  // Build a type → quantity lookup from the user's inventory
  const inventoryByType = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of inventory) {
      map.set(item.typeId, (map.get(item.typeId) ?? 0) + item.quantity);
    }
    return map;
  }, [inventory]);

  // Filter to contracts associated with this SSU
  const ssuContracts = useMemo(() => {
    if (!ssuId) return [];
    return contracts.filter((c) => {
      const ids = contractSsuIds(c);
      return ids.includes(ssuId);
    });
  }, [contracts, ssuId]);

  // Split into fulfillable / other
  const { fulfillable, other } = useMemo(() => {
    const fulfillable: TrustlessContractData[] = [];
    const other: TrustlessContractData[] = [];

    for (const c of ssuContracts) {
      if (c.status !== "Open") {
        other.push(c);
        continue;
      }
      const isExpired = Number(c.deadlineMs) < Date.now();
      if (isExpired) {
        other.push(c);
        continue;
      }
      if (canFulfillContract(c, inventoryByType)) {
        fulfillable.push(c);
      } else {
        other.push(c);
      }
    }

    return { fulfillable, other };
  }, [ssuContracts, inventoryByType]);

  return {
    fulfillableContracts: fulfillable,
    otherContracts: other,
    allContracts: [...fulfillable, ...other],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
