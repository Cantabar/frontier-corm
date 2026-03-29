/**
 * Hook for fetching user-defined assembly metadata (names, descriptions)
 * from the indexer API.
 *
 * Returns a Map<assemblyId, { name, description }> for O(1) lookup by
 * the structures page and other consumers.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssemblyMetadata } from "../lib/api";
import type { AssemblyMetadataData } from "../lib/types";

/**
 * Fetch assembly metadata for a list of assembly IDs.
 *
 * The hook batches all IDs into a single indexer request and returns
 * a stable Map for O(1) lookups. Automatically refetches when the
 * assembly ID list changes.
 */
export function useAssemblyMetadata(assemblyIds: string[]) {
  // Sort + join for a stable query key regardless of input order
  const sortedKey = useMemo(
    () => [...assemblyIds].sort().join(","),
    [assemblyIds],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["assemblyMetadata", sortedKey],
    queryFn: async (): Promise<AssemblyMetadataData[]> => {
      if (assemblyIds.length === 0) return [];
      const result = await getAssemblyMetadata(assemblyIds);
      return result.metadata.map((m) => ({
        assemblyId: m.assembly_id,
        name: m.name,
        description: m.description,
        owner: m.owner,
      }));
    },
    enabled: assemblyIds.length > 0,
    staleTime: 30_000,
  });

  const metadataMap = useMemo(() => {
    const map = new Map<string, { name: string; description: string }>();
    if (!data) return map;
    for (const entry of data) {
      map.set(entry.assemblyId, {
        name: entry.name,
        description: entry.description,
      });
    }
    return map;
  }, [data]);

  return { metadataMap, isLoading, error, refetch };
}
