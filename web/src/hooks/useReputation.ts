/**
 * Hooks for reading reputation data from the indexer.
 */

import { useQuery } from "@tanstack/react-query";
import { getReputation, getLeaderboard } from "../lib/indexer";

/** Fetch reputation snapshot + audit trail for a character in a tribe. */
export function useReputation(tribeId: string | undefined, characterId: string | undefined) {
  return useQuery({
    queryKey: ["reputation", tribeId, characterId],
    queryFn: () => getReputation(tribeId!, characterId!),
    enabled: !!tribeId && !!characterId,
  });
}

/** Fetch reputation leaderboard for a tribe. */
export function useLeaderboard(tribeId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["leaderboard", tribeId, limit],
    queryFn: () => getLeaderboard(tribeId!, limit),
    enabled: !!tribeId,
  });
}
