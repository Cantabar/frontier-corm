/**
 * Hook for reading Tribe object data from Sui RPC.
 */

import { useSuiClientQuery } from "@mysten/dapp-kit";
import type { TribeData } from "../lib/types";

export function useTribe(tribeId: string | undefined) {
  const { data, isLoading, error } = useSuiClientQuery(
    "getObject",
    {
      id: tribeId!,
      options: { showContent: true },
    },
    { enabled: !!tribeId },
  );

  const tribe: TribeData | null = (() => {
    const fields = (data?.data?.content as { fields?: Record<string, unknown> })?.fields;
    if (!fields) return null;
    return {
      id: data!.data!.objectId,
      name: fields.name as string,
      inGameTribeId: Number(fields.in_game_tribe_id ?? 0),
      leaderCharacterId: fields.leader_character_id as string,
      memberCount: Number(fields.member_count),
      treasuryBalance: String(
        (fields.treasury as { fields?: { value?: string } })?.fields?.value ?? "0",
      ),
      voteThreshold: Number(fields.vote_threshold),
      members: [], // Members are in a Table — requires separate dynamic field queries
    };
  })();

  return { tribe, isLoading, error };
}
