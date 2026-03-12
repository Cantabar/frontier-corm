/**
 * Hooks for reading Forge Planner data.
 */

import { useQuery } from "@tanstack/react-query";
import { getManufacturingFeed } from "../lib/indexer";
import type { PaginationParams } from "../lib/types";

/** Fetch manufacturing history from indexer for a tribe. */
export function useManufacturingHistory(
  tribeId: string | undefined,
  params: PaginationParams = {},
) {
  return useQuery({
    queryKey: ["manufacturingHistory", tribeId, params],
    queryFn: () => getManufacturingFeed(tribeId!, params),
    enabled: !!tribeId,
  });
}
