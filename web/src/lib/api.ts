/**
 * Environment-aware API facade.
 *
 * When appEnv === "local" all indexer calls resolve to mock data.
 * Otherwise the real indexer module is used.
 *
 * Consumers should `import * as api from "../lib/api"` (or the appropriate
 * relative path) instead of importing from `indexer.ts` directly.
 */

import { config } from "../config";

// Re-export types so consumers don't need a separate indexer import.
export type {
  LocationPodResponse,
  PendingMember,
  ZkProofSubmission,
  ZkFilteredResult,
  LocationTagResult,
  StructureTagResult,
} from "./indexer";

// For local mode, we override every export with the mock.  The dynamic import
// is resolved at startup before any component renders.
let _overrides: typeof import("./indexer") | null = null;

async function _initMock() {
  if (config.appEnv === "local") {
    _overrides = (await import("./mock/mockIndexer")) as unknown as typeof import("./indexer");
  }
}

/** Resolves once mock overrides (if any) are loaded. Await in main.tsx. */
export const ready: Promise<void> = _initMock();

// ---------------------------------------------------------------------------
// Proxy re-exports — each function checks for a mock override first.
// This avoids top-level await while keeping a synchronous call-site API.
// ---------------------------------------------------------------------------

import * as real from "./indexer";

type Api = typeof real;

function proxy<K extends keyof Api>(name: K): Api[K] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    const impl = (_overrides as any)?.[name] ?? (real as any)[name];
    return impl(...args);
  }) as unknown as Api[K];
}

export const onIndexerError = proxy("onIndexerError");
export const getHealth = proxy("getHealth");
export const getStats = proxy("getStats");
export const getEvents = proxy("getEvents");
export const getEventsByTribe = proxy("getEventsByTribe");
export const getEventsByCharacter = proxy("getEventsByCharacter");
export const getEventsByObject = proxy("getEventsByObject");
export const getEventProof = proxy("getEventProof");
export const getTrustlessContractsFeed = proxy("getTrustlessContractsFeed");
export const getTrustlessContractHistory = proxy("getTrustlessContractHistory");
export const getPayoutEvents = proxy("getPayoutEvents");
export const getContractContext = proxy("getContractContext");
export const getEventTypes = proxy("getEventTypes");
export const getLocationPodsByTribe = proxy("getLocationPodsByTribe");
export const getLocationPod = proxy("getLocationPod");
export const submitLocationPod = proxy("submitLocationPod");
export const deleteLocationPod = proxy("deleteLocationPod");
export const getTlkStatus = proxy("getTlkStatus");
export const getTlk = proxy("getTlk");
export const initTlk = proxy("initTlk");
export const rotateTlk = proxy("rotateTlk");
export const wrapTlkForMember = proxy("wrapTlkForMember");
export const registerPublicKey = proxy("registerPublicKey");
export const getPendingMembers = proxy("getPendingMembers");
export const submitZkProof = proxy("submitZkProof");
export const getZkRegionResults = proxy("getZkRegionResults");
export const getZkProximityResults = proxy("getZkProximityResults");
export const getLocationTagsForStructure = proxy("getLocationTagsForStructure");
export const getStructuresByLocationTag = proxy("getStructuresByLocationTag");
export const submitNetworkNodeLocationPod = proxy("submitNetworkNodeLocationPod");
export const refreshNetworkNodeLocationPod = proxy("refreshNetworkNodeLocationPod");
