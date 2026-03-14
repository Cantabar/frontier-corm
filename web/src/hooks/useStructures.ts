/**
 * Hook for querying Smart Assemblies (structures) owned by the current wallet.
 *
 * On-chain, different structure kinds have separate Move types — Assembly,
 * StorageUnit, Gate and Turret — each with their own OwnerCap<T>.  We query
 * for ALL four cap types and merge them into a single list.
 */

import { useMemo } from "react";
import { useSuiClientQueries } from "@mysten/dapp-kit";
import { useIdentity } from "./useIdentity";
import { config } from "../config";
import type { AssemblyData, AssemblyStatus } from "../lib/types";

const worldPkg = () => config.packages.world;

/** Move module::Type pairs whose OwnerCaps represent player structures. */
const STRUCTURE_TYPES = [
  "assembly::Assembly",
  "storage_unit::StorageUnit",
  "gate::Gate",
  "turret::Turret",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAssemblyStatus(raw: unknown): AssemblyStatus {
  if (typeof raw === "object" && raw !== null) {
    if ("Online" in raw) return "Online";
    if ("Offline" in raw) return "Offline";
    if ("Unanchoring" in raw) return "Unanchoring";
  }
  if (raw === "Online") return "Online";
  if (raw === "Offline") return "Offline";
  if (raw === "Unanchoring") return "Unanchoring";
  return "Anchored";
}

interface MetadataFields {
  name?: string;
  description?: string;
  url?: string;
}

function parseAssemblyFields(
  objectId: string,
  ownerCapId: string,
  fields: Record<string, unknown>,
): AssemblyData {
  const metaOuter = fields.metadata as { fields?: MetadataFields } | null;
  const meta = metaOuter?.fields;

  return {
    id: objectId,
    ownerCapId,
    typeId: Number(fields.type_id ?? 0),
    status: parseAssemblyStatus(fields.status),
    name: meta?.name || "",
    description: meta?.description || "",
    imageUrl: meta?.url || "",
    energySourceId: fields.energy_source_id
      ? String(fields.energy_source_id)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMyStructures() {
  const { address } = useIdentity();
  const pkg = worldPkg();
  const enabled = !!address && pkg !== "0x0";

  // Step 1: Query wallet-owned OwnerCap<T> objects for every structure kind
  const capResults = useSuiClientQueries({
    queries: enabled
      ? STRUCTURE_TYPES.map((t) => ({
          method: "getOwnedObjects" as const,
          params: {
            owner: address,
            filter: { StructType: `${pkg}::access::OwnerCap<${pkg}::${t}>` },
            options: { showContent: true },
          },
        }))
      : [],
    combine: (results) => ({
      data: results.flatMap((r) => r.data?.data ?? []),
      isLoading: results.some((r) => r.isLoading),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => results.forEach((r) => r.refetch()),
    }),
  });

  // Extract cap ID → assembly ID mappings
  const capMappings = useMemo(() => {
    if (!capResults.data) return [];
    return capResults.data
      .map((obj) => {
        const fields = (obj.data?.content as { fields?: Record<string, unknown> })?.fields;
        if (!fields) return null;
        return {
          capId: obj.data!.objectId,
          assemblyId: String(fields.authorized_object_id ?? ""),
        };
      })
      .filter((m): m is { capId: string; assemblyId: string } => m !== null && !!m.assemblyId);
  }, [capResults.data]);

  // Step 2: Batch-fetch each shared structure object
  const assemblyResults = useSuiClientQueries({
    queries: capMappings.length > 0
      ? capMappings.map((m) => ({
          method: "getObject" as const,
          params: { id: m.assemblyId, options: { showContent: true } },
        }))
      : [],
    combine: (results) => ({
      data: results.map((r) => r.data),
      isLoading: results.some((r) => r.isLoading),
      error: results.find((r) => r.error)?.error ?? null,
    }),
  });

  // Step 3: Parse into AssemblyData[]
  const structures = useMemo(() => {
    if (!assemblyResults.data) return [];
    return assemblyResults.data
      .map((obj, i) => {
        if (!obj?.data) return null;
        const fields = (obj.data.content as { fields?: Record<string, unknown> })?.fields;
        if (!fields) return null;
        return parseAssemblyFields(
          obj.data.objectId,
          capMappings[i].capId,
          fields,
        );
      })
      .filter((s): s is AssemblyData => s !== null);
  }, [assemblyResults.data, capMappings]);

  return {
    structures,
    isLoading: capResults.isLoading || assemblyResults.isLoading,
    error: capResults.error ?? assemblyResults.error,
    refetch: capResults.refetch,
  };
}
