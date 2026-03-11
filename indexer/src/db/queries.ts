/**
 * SQL queries for the Frontier Lattice event indexer (Postgres).
 *
 * All queries are async and use the pg Pool for connection management.
 */

import type pg from "pg";
import type { ArchivedEvent, EventTypeName } from "../types.js";

// ============================================================
// Insert
// ============================================================

const INSERT_EVENT_SQL = `
  INSERT INTO events (
    event_type, event_name, module, event_data,
    tx_digest, event_seq, checkpoint_seq, checkpoint_digest, timestamp_ms,
    primary_id, tribe_id, character_id
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
  )
  ON CONFLICT (tx_digest, event_seq) DO NOTHING
  RETURNING id
`;

function eventParams(event: ArchivedEvent) {
  return [
    event.event_type, event.event_name, event.module, event.event_data,
    event.tx_digest, event.event_seq, event.checkpoint_seq,
    event.checkpoint_digest, event.timestamp_ms,
    event.primary_id, event.tribe_id, event.character_id,
  ];
}

export async function insertEvent(pool: pg.Pool, event: ArchivedEvent): Promise<number> {
  const result = await pool.query(INSERT_EVENT_SQL, eventParams(event));
  return result.rows[0]?.id ?? 0;
}

export async function insertEventsBatch(pool: pg.Pool, events: ArchivedEvent[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of events) {
      await client.query(INSERT_EVENT_SQL, eventParams(event));
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Reputation Snapshot
// ============================================================

const UPSERT_REPUTATION_SQL = `
  INSERT INTO reputation_snapshots (tribe_id, character_id, score, last_event_id, updated_at)
  VALUES ($1, $2, $3, $4, NOW())
  ON CONFLICT (tribe_id, character_id) DO UPDATE SET
    score = $3,
    last_event_id = $4,
    updated_at = NOW()
`;

export async function upsertReputation(
  pool: pg.Pool,
  tribeId: string,
  characterId: string,
  score: number,
  lastEventId: number,
): Promise<void> {
  await pool.query(UPSERT_REPUTATION_SQL, [tribeId, characterId, score, lastEventId]);
}

// ============================================================
// Cursor
// ============================================================

const UPDATE_CURSOR_SQL = `
  UPDATE indexer_cursor SET
    last_tx_digest = $1,
    last_event_seq = $2,
    last_checkpoint = $3,
    updated_at = NOW()
  WHERE id = 1
`;

const GET_CURSOR_SQL = `
  SELECT last_tx_digest, last_event_seq, last_checkpoint
  FROM indexer_cursor WHERE id = 1
`;

export interface IndexerCursor {
  last_tx_digest: string | null;
  last_event_seq: number | null;
  last_checkpoint: string | null;
}

export async function updateCursor(
  pool: pg.Pool,
  txDigest: string,
  eventSeq: number,
  checkpoint: string,
): Promise<void> {
  await pool.query(UPDATE_CURSOR_SQL, [txDigest, eventSeq, checkpoint]);
}

export async function getCursor(pool: pg.Pool): Promise<IndexerCursor> {
  const result = await pool.query(GET_CURSOR_SQL);
  return result.rows[0] as IndexerCursor;
}

// ============================================================
// Query: Events
// ============================================================

interface EventQueryParams {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

function defaultParams(params?: EventQueryParams) {
  return {
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
    order: params?.order ?? "desc",
  };
}

export async function getEvents(
  pool: pg.Pool,
  params?: EventQueryParams,
): Promise<ArchivedEvent[]> {
  const { limit, offset, order } = defaultParams(params);
  const dir = order === "asc" ? "ASC" : "DESC";
  const result = await pool.query(
    `SELECT * FROM events ORDER BY id ${dir} LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows as ArchivedEvent[];
}

export async function getEventsByType(
  pool: pg.Pool,
  eventName: EventTypeName,
  params?: EventQueryParams,
): Promise<ArchivedEvent[]> {
  const { limit, offset, order } = defaultParams(params);
  const dir = order === "asc" ? "ASC" : "DESC";
  const result = await pool.query(
    `SELECT * FROM events WHERE event_name = $1 ORDER BY id ${dir} LIMIT $2 OFFSET $3`,
    [eventName, limit, offset],
  );
  return result.rows as ArchivedEvent[];
}

export async function getEventsByTribe(
  pool: pg.Pool,
  tribeId: string,
  params?: EventQueryParams & { eventName?: EventTypeName },
): Promise<ArchivedEvent[]> {
  const { limit, offset, order } = defaultParams(params);
  const dir = order === "asc" ? "ASC" : "DESC";
  if (params?.eventName) {
    const result = await pool.query(
      `SELECT * FROM events WHERE tribe_id = $1 AND event_name = $2
       ORDER BY id ${dir} LIMIT $3 OFFSET $4`,
      [tribeId, params.eventName, limit, offset],
    );
    return result.rows as ArchivedEvent[];
  }
  const result = await pool.query(
    `SELECT * FROM events WHERE tribe_id = $1 ORDER BY id ${dir} LIMIT $2 OFFSET $3`,
    [tribeId, limit, offset],
  );
  return result.rows as ArchivedEvent[];
}

export async function getEventsByCharacter(
  pool: pg.Pool,
  characterId: string,
  params?: EventQueryParams,
): Promise<ArchivedEvent[]> {
  const { limit, offset, order } = defaultParams(params);
  const dir = order === "asc" ? "ASC" : "DESC";
  const result = await pool.query(
    `SELECT * FROM events WHERE character_id = $1
     ORDER BY id ${dir} LIMIT $2 OFFSET $3`,
    [characterId, limit, offset],
  );
  return result.rows as ArchivedEvent[];
}

export async function getEventsByPrimaryId(
  pool: pg.Pool,
  primaryId: string,
  params?: EventQueryParams,
): Promise<ArchivedEvent[]> {
  const { limit, offset, order } = defaultParams(params);
  const dir = order === "asc" ? "ASC" : "DESC";
  const result = await pool.query(
    `SELECT * FROM events WHERE primary_id = $1
     ORDER BY id ${dir} LIMIT $2 OFFSET $3`,
    [primaryId, limit, offset],
  );
  return result.rows as ArchivedEvent[];
}

export async function getEventById(
  pool: pg.Pool,
  id: number,
): Promise<ArchivedEvent | undefined> {
  const result = await pool.query("SELECT * FROM events WHERE id = $1", [id]);
  return result.rows[0] as ArchivedEvent | undefined;
}

// ============================================================
// Query: Reputation
// ============================================================

export interface ReputationSnapshot {
  tribe_id: string;
  character_id: string;
  score: number;
  last_event_id: number;
  updated_at: string;
}

export async function getReputation(
  pool: pg.Pool,
  tribeId: string,
  characterId: string,
): Promise<ReputationSnapshot | undefined> {
  const result = await pool.query(
    "SELECT * FROM reputation_snapshots WHERE tribe_id = $1 AND character_id = $2",
    [tribeId, characterId],
  );
  return result.rows[0] as ReputationSnapshot | undefined;
}

export async function getTribeLeaderboard(
  pool: pg.Pool,
  tribeId: string,
  limit = 50,
): Promise<ReputationSnapshot[]> {
  const result = await pool.query(
    `SELECT * FROM reputation_snapshots
     WHERE tribe_id = $1
     ORDER BY score DESC
     LIMIT $2`,
    [tribeId, limit],
  );
  return result.rows as ReputationSnapshot[];
}

/**
 * Reputation audit trail: all ReputationUpdatedEvent entries for a
 * tribe×character pair, ordered chronologically. Each event includes
 * checkpoint proof metadata for independent verification.
 */
export async function getReputationAuditTrail(
  pool: pg.Pool,
  tribeId: string,
  characterId: string,
): Promise<ArchivedEvent[]> {
  const result = await pool.query(
    `SELECT * FROM events
     WHERE tribe_id = $1 AND character_id = $2 AND event_name = 'ReputationUpdatedEvent'
     ORDER BY id ASC`,
    [tribeId, characterId],
  );
  return result.rows as ArchivedEvent[];
}

// ============================================================
// Query: Stats
// ============================================================

export interface IndexerStats {
  total_events: number;
  events_by_module: Record<string, number>;
  latest_checkpoint: string | null;
  latest_timestamp: string | null;
}

export async function getStats(pool: pg.Pool): Promise<IndexerStats> {
  const totalResult = await pool.query("SELECT COUNT(*) as count FROM events");
  const total = Number(totalResult.rows[0].count);

  const byModuleResult = await pool.query(
    "SELECT module, COUNT(*) as count FROM events GROUP BY module",
  );

  const latestResult = await pool.query(
    "SELECT checkpoint_seq, timestamp_ms FROM events ORDER BY id DESC LIMIT 1",
  );
  const latest = latestResult.rows[0] as
    | { checkpoint_seq: string; timestamp_ms: string }
    | undefined;

  return {
    total_events: total,
    events_by_module: Object.fromEntries(
      byModuleResult.rows.map((r: { module: string; count: string }) => [
        r.module,
        Number(r.count),
      ]),
    ),
    latest_checkpoint: latest?.checkpoint_seq ?? null,
    latest_timestamp: latest?.timestamp_ms ?? null,
  };
}
