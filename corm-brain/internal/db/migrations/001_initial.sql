-- 001_initial.sql — corm-brain schema
CREATE EXTENSION IF NOT EXISTS vector;

-- Corm → network node mapping (many nodes can belong to one corm)
CREATE TABLE IF NOT EXISTS corm_network_nodes (
  network_node_id TEXT PRIMARY KEY,
  corm_id         TEXT NOT NULL,
  linked_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_nn_corm ON corm_network_nodes (corm_id);

-- Raw event log (append-only)
CREATE TABLE IF NOT EXISTS corm_events (
  id              BIGSERIAL PRIMARY KEY,
  corm_id         TEXT NOT NULL,
  network_node_id TEXT,
  session_id      TEXT,
  player_address  TEXT,
  event_type      TEXT NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_events_corm ON corm_events (corm_id, id);

-- Per-corm learned state (upserted by trait-reducer)
CREATE TABLE IF NOT EXISTS corm_traits (
  corm_id                  TEXT PRIMARY KEY,
  phase                    SMALLINT DEFAULT 0,
  stability                REAL DEFAULT 0,
  corruption               REAL DEFAULT 0,
  agenda_weights           JSONB DEFAULT '{"industry":0.33,"expansion":0.33,"defense":0.33}',
  contract_type_affinity   JSONB DEFAULT '{}',
  patience                 REAL DEFAULT 0.5,
  paranoia                 REAL DEFAULT 0.0,
  volatility               REAL DEFAULT 0.0,
  player_affinities        JSONB DEFAULT '{}',
  consolidation_checkpoint BIGINT DEFAULT 0,
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- Episodic memories (RAG documents, per-corm)
CREATE TABLE IF NOT EXISTS corm_memories (
  id               BIGSERIAL PRIMARY KEY,
  corm_id          TEXT NOT NULL,
  memory_text      TEXT NOT NULL,
  memory_type      TEXT NOT NULL,
  importance       REAL DEFAULT 0.5,
  source_events    JSONB,
  embedding        vector(384),
  created_at       TIMESTAMPTZ DEFAULT now(),
  last_recalled_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_memories_corm ON corm_memories (corm_id);
CREATE INDEX IF NOT EXISTS idx_corm_memories_embedding ON corm_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- Corm response log (for conversational continuity)
CREATE TABLE IF NOT EXISTS corm_responses (
  id          BIGSERIAL PRIMARY KEY,
  corm_id     TEXT NOT NULL,
  session_id  TEXT,
  action_type TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_responses_corm ON corm_responses (corm_id, id);
