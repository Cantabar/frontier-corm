/**
 * Hooks for reading Contract Board data.
 */

import { useQuery } from "@tanstack/react-query";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { config } from "../config";
import { getJobsFeed } from "../lib/indexer";
import type { PaginationParams } from "../lib/types";

/** Fetch active job objects from on-chain (all JobPosting<C> for a package). */
export function useActiveJobs() {
  const { data, isLoading, error } = useSuiClientQuery(
    "queryEvents",
    {
      query: {
        MoveEventType: `${config.packages.contractBoard}::contract_board::JobCreatedEvent`,
      },
      limit: 50,
      order: "descending",
    },
    { enabled: config.packages.contractBoard !== "0x0" },
  );

  return { events: data?.data ?? [], isLoading, error };
}

/** Fetch job history from indexer for a tribe. */
export function useJobHistory(tribeId: string | undefined, params: PaginationParams = {}) {
  return useQuery({
    queryKey: ["jobHistory", tribeId, params],
    queryFn: () => getJobsFeed(tribeId!, params),
    enabled: !!tribeId,
  });
}
