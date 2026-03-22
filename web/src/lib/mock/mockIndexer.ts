/**
 * Mock implementation of the indexer API.
 *
 * Every function mirrors the signature in `../indexer.ts` but returns
 * static fixture data wrapped in a small delay for realism.
 */

import type { ArchivedEvent, EventTypeName, PaginationParams } from "../types";
import type {
  LocationPodResponse,
  LocationTagResult,
  PendingMember,
  StructureTagResult,
  ZkFilteredResult,
  ZkProofSubmission,
} from "../indexer";
import {
  mockEvents,
  mockHealth,
  mockStats,
  mockEventTypes,
} from "./data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay<T>(value: T, ms = 80): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function paginate(
  events: ArchivedEvent[],
  params: PaginationParams & { type?: EventTypeName } = {},
): ArchivedEvent[] {
  let filtered = params.type
    ? events.filter((e) => e.event_name === params.type)
    : events;
  if (params.order === "asc") filtered = [...filtered].reverse();
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  return filtered.slice(offset, offset + limit);
}

const emptyEvents = { events: [] as ArchivedEvent[] };

// ---------------------------------------------------------------------------
// Error listener (no-op for mock)
// ---------------------------------------------------------------------------

export function onIndexerError(_listener: (error: Error, path: string) => void): () => void {
  return () => {};
}

// ---------------------------------------------------------------------------
// Health / Stats
// ---------------------------------------------------------------------------

export function getHealth() {
  return delay(mockHealth);
}

export function getStats() {
  return delay(mockStats);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function getEvents(params: PaginationParams & { type?: EventTypeName } = {}) {
  return delay({ events: paginate(mockEvents, params) });
}

export function getEventsByTribe(
  tribeId: string,
  params: PaginationParams & { type?: EventTypeName } = {},
) {
  const events = paginate(
    mockEvents.filter((e) => e.tribe_id === tribeId),
    params,
  );
  return delay({ events });
}

export function getEventsByCharacter(characterId: string, params: PaginationParams = {}) {
  const events = paginate(
    mockEvents.filter((e) => e.character_id === characterId),
    params,
  );
  return delay({ events });
}

export function getEventsByObject(_objectId: string, params: PaginationParams = {}) {
  return delay({ events: paginate([], params) });
}

// ---------------------------------------------------------------------------
// Proof
// ---------------------------------------------------------------------------

export function getEventProof(eventId: number) {
  const event = mockEvents.find((e) => e.id === eventId) ?? mockEvents[0];
  return delay({
    event_id: event.id,
    event_type: event.event_type,
    event_name: event.event_name,
    event_data: event.event_data,
    proof: {
      tx_digest: event.tx_digest,
      event_seq: event.event_seq,
      checkpoint_seq: event.checkpoint_seq,
      checkpoint_digest: event.checkpoint_digest,
      timestamp_ms: event.timestamp_ms,
      verification_note: "Mock proof — not verifiable",
    },
  });
}

// ---------------------------------------------------------------------------
// Trustless Contracts
// ---------------------------------------------------------------------------

export function getTrustlessContractsFeed(params: PaginationParams = {}) {
  return getEvents({ ...params, type: "ContractCreatedEvent" });
}

export function getTrustlessContractHistory(params: PaginationParams = {}) {
  return getEvents({ ...params, type: "ContractCompletedEvent" });
}

// ---------------------------------------------------------------------------
// Payout Notifications
// ---------------------------------------------------------------------------

export function getPayoutEvents(
  characterId: string,
  sinceId?: number,
  _limit?: number,
) {
  return delay({
    events: [] as ArchivedEvent[],
    character_id: characterId,
    since_id: sinceId ?? null,
  });
}

export function getContractContext(_contractId: string) {
  return delay(mockEvents[2]); // ContractCreatedEvent fixture
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function getEventTypes() {
  return delay(mockEventTypes);
}

// ---------------------------------------------------------------------------
// Shadow Location Network (stubs — return empty data)
// ---------------------------------------------------------------------------

const emptyPods = { pods: [] as LocationPodResponse[], tribe_id: "", count: 0 };

export function getLocationPodsByTribe(_tribeId: string, _authHeader: string) {
  return delay(emptyPods);
}

export function getLocationPod(_structureId: string, _tribeId: string, _authHeader: string) {
  return delay({} as LocationPodResponse);
}

export function submitLocationPod(_authHeader: string, _body: unknown) {
  return delay({ id: 0, structureId: "", tribeId: "" });
}

export function deleteLocationPod(_structureId: string, _authHeader: string) {
  return delay({ deleted: true, structureId: "" });
}

export function getTlkStatus(_tribeId: string, _authHeader: string) {
  return delay({ tribe_id: "", initialized: false, tlk_version: 0, has_wrapped_key: false });
}

export function getTlk(_tribeId: string, _authHeader: string) {
  return delay({ tribe_id: "", tlk_version: 0, wrapped_key: "" });
}

export function initTlk(_authHeader: string, _body: unknown) {
  return delay({ tribe_id: "", tlk_version: 1, members_wrapped: 0 });
}

export function rotateTlk(_authHeader: string, _body: unknown) {
  return delay({ tribe_id: "", tlk_version: 1, members_wrapped: 0 });
}

export function wrapTlkForMember(_authHeader: string, _body: unknown) {
  return delay({ tribe_id: "", tlk_version: 1, member: "" });
}

// ---------------------------------------------------------------------------
// TLK Key Distribution
// ---------------------------------------------------------------------------

export function registerPublicKey(_authHeader: string, _body: unknown) {
  return delay({ tribe_id: "", member: "", registered: true });
}

export function getPendingMembers(_tribeId: string, _authHeader: string) {
  return delay({ tribe_id: "", count: 0, members: [] as PendingMember[] });
}

// ---------------------------------------------------------------------------
// ZK Location Proofs
// ---------------------------------------------------------------------------

export function submitZkProof(_authHeader: string, _body: ZkProofSubmission) {
  return delay({ id: 0, structureId: "", tribeId: "", filterType: "", verified: true });
}

export function getZkRegionResults(_authHeader: string, _params: Record<string, string>) {
  return delay({ tribe_id: "", filter_type: "region", count: 0, results: [] as ZkFilteredResult[] });
}

export function getZkProximityResults(_authHeader: string, _params: Record<string, string>) {
  return delay({ tribe_id: "", filter_type: "proximity", count: 0, results: [] as ZkFilteredResult[] });
}

// ---------------------------------------------------------------------------
// Public Location Tags
// ---------------------------------------------------------------------------

export function getLocationTagsForStructure(_structureId: string) {
  return delay({ structure_id: "", tags: [] as LocationTagResult[] });
}

export function getStructuresByLocationTag(_tagType: "region" | "constellation", _tagId: number) {
  return delay({ tag_type: "", tag_id: 0, count: 0, structures: [] as StructureTagResult[] });
}

// ---------------------------------------------------------------------------
// Network Node Location PODs
// ---------------------------------------------------------------------------

export function submitNetworkNodeLocationPod(_authHeader: string, _body: unknown) {
  return delay({ networkNodeId: "", tribeId: "", structureCount: 0 });
}

export function refreshNetworkNodeLocationPod(_authHeader: string, _body: unknown) {
  return delay({ networkNodeId: "", tribeId: "", structureCount: 0, staleRemoved: 0 });
}
