/**
 * Static fixture data used when appEnv === "local".
 *
 * Covers the return shapes of key indexer endpoints and the World API
 * tribe list so the UI can render without any live backend.
 */

import type { ArchivedEvent, WorldTribeInfo } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = Date.now();
const ts = (offsetMs: number) => String(now - offsetMs);

// ---------------------------------------------------------------------------
// World API tribe fixtures
// ---------------------------------------------------------------------------

export const mockWorldTribes: WorldTribeInfo[] = [
  {
    id: 1,
    name: "Pathfinder Collective",
    nameShort: "PGCL",
    description: "Explorers charting the uncharted.",
    taxRate: 5,
    tribeUrl: "",
  },
  {
    id: 2,
    name: "Iron Meridian",
    nameShort: "IRON",
    description: "Industrial backbone of the frontier.",
    taxRate: 8,
    tribeUrl: "",
  },
  {
    id: 3,
    name: "Void Sentinels",
    nameShort: "VOID",
    description: "Defence specialists guarding the gates.",
    taxRate: 3,
    tribeUrl: "",
  },
];

// ---------------------------------------------------------------------------
// Archived event fixtures
// ---------------------------------------------------------------------------

let _eventId = 1;
function makeEvent(
  overrides: Partial<ArchivedEvent> & Pick<ArchivedEvent, "event_name" | "event_data">,
): ArchivedEvent {
  const id = _eventId++;
  return {
    id,
    event_type: `0x0::module::${overrides.event_name}`,
    tx_digest: `mock_tx_${id}`,
    event_seq: 0,
    checkpoint_seq: String(1000 + id),
    checkpoint_digest: `mock_cp_${id}`,
    timestamp_ms: ts(id * 60_000),
    primary_id: null,
    tribe_id: null,
    character_id: null,
    ...overrides,
  };
}

export const mockEvents: ArchivedEvent[] = [
  makeEvent({
    event_name: "TribeCreatedEvent",
    event_data: { tribe_id: "0xaaa", name: "Pathfinder Collective", leader: "0x111" },
    tribe_id: "0xaaa",
    character_id: "0x111",
  }),
  makeEvent({
    event_name: "MemberJoinedEvent",
    event_data: { tribe_id: "0xaaa", character_id: "0x222", role: "Member" },
    tribe_id: "0xaaa",
    character_id: "0x222",
  }),
  makeEvent({
    event_name: "ContractCreatedEvent",
    event_data: {
      contract_id: "0xc01",
      poster_id: "0x111",
      variant: "CoinForCoin",
      escrow: "1000000000",
      wanted: "500000000",
    },
    character_id: "0x111",
  }),
  makeEvent({
    event_name: "ContractFilledEvent",
    event_data: { contract_id: "0xc01", filler_id: "0x222", amount: "500000000" },
    character_id: "0x222",
  }),
  makeEvent({
    event_name: "ContractCompletedEvent",
    event_data: { contract_id: "0xc01" },
  }),
];

// ---------------------------------------------------------------------------
// Indexer health / stats fixtures
// ---------------------------------------------------------------------------

export const mockHealth = { status: "ok", timestamp: new Date().toISOString() };

export const mockStats = {
  total_events: mockEvents.length,
  latest_checkpoint: String(1000 + mockEvents.length),
};

export const mockEventTypes = {
  event_types: [
    "TribeCreatedEvent",
    "MemberJoinedEvent",
    "ContractCreatedEvent",
    "ContractFilledEvent",
    "ContractCompletedEvent",
  ],
};
