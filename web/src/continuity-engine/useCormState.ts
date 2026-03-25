/**
 * Hook to read on-chain CormState values (phase, stability, corruption).
 *
 * Reads the shared CormState object by ID using `useSuiClientQuery`.
 * The object ID is sourced from config (VITE_CORM_STATE_ID) or can be
 * overridden via a prop/param for multi-corm support.
 */

import { useSuiClientQuery } from "@mysten/dapp-kit";
import { config } from "../config";

export interface CormStateData {
  phase: number;
  stability: number;
  corruption: number;
  networkNodeId: string;
  admin: string;
}

export function useCormState(objectId?: string) {
  const id = objectId || config.cormStateId;

  const { data, isLoading, error } = useSuiClientQuery(
    "getObject",
    {
      id: id!,
      options: { showContent: true },
    },
    { enabled: !!id },
  );

  const fields = (
    data?.data?.content as { fields?: Record<string, unknown> }
  )?.fields;

  const cormState: CormStateData | null = fields
    ? {
        phase: Number(fields.phase ?? 0),
        stability: Number(fields.stability ?? 0),
        corruption: Number(fields.corruption ?? 0),
        networkNodeId: (fields.network_node_id as string) ?? "",
        admin: (fields.admin as string) ?? "",
      }
    : null;

  return { cormState, isLoading, error };
}
