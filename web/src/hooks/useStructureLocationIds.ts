/**
 * Lightweight hook that returns the set of structure IDs that have
 * location PODs registered for the active tribe.
 *
 * Only requires wallet auth — does NOT need the TLK to be unlocked
 * because it only inspects the `structure_id` field from the raw
 * (still-encrypted) API response.
 */

import { useState, useCallback, useEffect } from "react";
import { useIdentity } from "./useIdentity";
import { useLocationPods } from "./useLocationPods";

export interface UseStructureLocationIdsReturn {
  /** Set of structure IDs that have at least one location POD. */
  locationIds: Set<string>;
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Re-fetch location IDs from the server. */
  refetch: () => void;
}

export function useStructureLocationIds(): UseStructureLocationIdsReturn {
  const { tribeCaps } = useIdentity();
  const tribeId = tribeCaps[0]?.tribeId ?? null;
  const { getAuthHeader } = useLocationPods();

  const [locationIds, setLocationIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const fetchIds = useCallback(async () => {
    if (!tribeId) return;
    setIsLoading(true);
    try {
      const authHeader = await getAuthHeader();
      // Import inline to avoid circular deps — we only need the raw response
      const { getLocationPodsByTribe } = await import("../lib/indexer");
      const { pods } = await getLocationPodsByTribe(tribeId, authHeader);
      setLocationIds(new Set(pods.map((p) => p.structure_id)));
    } catch {
      // Silently fail — user may not have auth yet or tribe may not have pods
    } finally {
      setIsLoading(false);
    }
  }, [tribeId, getAuthHeader]);

  useEffect(() => {
    fetchIds();
  }, [fetchIds]);

  return { locationIds, isLoading, refetch: fetchIds };
}
