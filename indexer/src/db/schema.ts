/**
 * Postgres schema for the Frontier Corm event indexer.
 *
 * Tables:
 *   - events: all archived on-chain events with checkpoint proof metadata
 *   - reputation_snapshots: materialised latest reputation per tribe×character
 *   - indexer_cursor: tracks the last processed event cursor for resumability
 *
 * Run standalone to create/migrate: `tsx src/db/schema.ts`
 */

import pg from "pg";
const { Pool } = pg;

/**
 * Initialise a Postgres connection pool and apply the schema.
 * Retries connection up to 5 times (useful when Postgres is still starting
 * in docker-compose).
 */
export async function initDatabase(databaseUrl: string): Promise<pg.Pool> {
  const pool = new Pool({ connectionString: databaseUrl });

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (err) {
      if (attempt < 5) {
        console.log(
          `[db] Postgres not ready (attempt ${attempt}/5), retrying in 2s...`,
        );
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.error("[db] Could not connect to Postgres after 5 attempts.");
        throw err;
      }
    }
  }

  await pool.query(SCHEMA_SQL);
  return pool;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id              SERIAL PRIMARY KEY,
    event_type      TEXT    NOT NULL,
    event_name      TEXT    NOT NULL,
    module          TEXT    NOT NULL,

    event_data      TEXT    NOT NULL,

    tx_digest           TEXT NOT NULL,
    event_seq           INTEGER NOT NULL,
    checkpoint_seq      TEXT NOT NULL,
    checkpoint_digest   TEXT NOT NULL,
    timestamp_ms        TEXT NOT NULL,

    primary_id      TEXT NOT NULL,
    tribe_id        TEXT NOT NULL,
    character_id    TEXT,

    archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(tx_digest, event_seq)
  );

  CREATE INDEX IF NOT EXISTS idx_events_event_name   ON events(event_name);
  CREATE INDEX IF NOT EXISTS idx_events_tribe_id     ON events(tribe_id);
  CREATE INDEX IF NOT EXISTS idx_events_character_id ON events(character_id);
  CREATE INDEX IF NOT EXISTS idx_events_primary_id   ON events(primary_id);
  CREATE INDEX IF NOT EXISTS idx_events_module       ON events(module);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp    ON events(timestamp_ms);
  CREATE INDEX IF NOT EXISTS idx_events_checkpoint   ON events(checkpoint_seq);
  CREATE INDEX IF NOT EXISTS idx_events_tribe_name   ON events(tribe_id, event_name);

  CREATE TABLE IF NOT EXISTS reputation_snapshots (
    tribe_id      TEXT NOT NULL,
    character_id  TEXT NOT NULL,
    score         INTEGER NOT NULL DEFAULT 0,
    last_event_id INTEGER REFERENCES events(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tribe_id, character_id)
  );

  CREATE TABLE IF NOT EXISTS indexer_cursor (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    last_tx_digest  TEXT,
    last_event_seq  INTEGER,
    last_checkpoint TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  INSERT INTO indexer_cursor (id, last_tx_digest, last_event_seq, last_checkpoint)
  VALUES (1, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
`;

// Allow running standalone for migration
const isMain =
  process.argv[1]?.endsWith("schema.ts") ||
  process.argv[1]?.endsWith("schema.js");
if (isMain) {
  const databaseUrl =
    process.argv[2] ??
    process.env.DATABASE_URL ??
    "postgresql://corm:corm@localhost:5432/frontier_corm";
  console.log(`Migrating database at ${databaseUrl}...`);
  initDatabase(databaseUrl).then((pool) => {
    console.log("Schema applied successfully.");
    pool.end();
  });
}
