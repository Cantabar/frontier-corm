-- 001_initial.sql — continuity-engine schema
CREATE EXTENSION IF NOT EXISTS vector;

-- Corm → network node mapping (many nodes can belong to one corm)
-- Composite PK: same network_node_id may exist in different environments.
CREATE TABLE IF NOT EXISTS corm_network_nodes (
  environment     TEXT NOT NULL DEFAULT 'default',
  network_node_id TEXT NOT NULL,
  corm_id         TEXT NOT NULL,
  linked_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (environment, network_node_id)
);
CREATE INDEX IF NOT EXISTS idx_corm_nn_corm ON corm_network_nodes (environment, corm_id);

-- Raw event log (append-only)
CREATE TABLE IF NOT EXISTS corm_events (
  id              BIGSERIAL PRIMARY KEY,
  environment     TEXT NOT NULL DEFAULT 'default',
  corm_id         TEXT NOT NULL,
  network_node_id TEXT,
  session_id      TEXT,
  player_address  TEXT,
  event_type      TEXT NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_events_corm ON corm_events (environment, corm_id, id);

-- Per-corm learned state (upserted by trait-reducer)
-- Composite PK: same corm_id could theoretically exist across environments.
CREATE TABLE IF NOT EXISTS corm_traits (
  environment              TEXT NOT NULL DEFAULT 'default',
  corm_id                  TEXT NOT NULL,
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
  updated_at               TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (environment, corm_id)
);

-- Episodic memories (RAG documents, per-corm)
CREATE TABLE IF NOT EXISTS corm_memories (
  id               BIGSERIAL PRIMARY KEY,
  environment      TEXT NOT NULL DEFAULT 'default',
  corm_id          TEXT NOT NULL,
  memory_text      TEXT NOT NULL,
  memory_type      TEXT NOT NULL,
  importance       REAL DEFAULT 0.5,
  source_events    JSONB,
  embedding        vector(384),
  created_at       TIMESTAMPTZ DEFAULT now(),
  last_recalled_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_memories_corm ON corm_memories (environment, corm_id);
CREATE INDEX IF NOT EXISTS idx_corm_memories_embedding ON corm_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- Corm response log (for conversational continuity)
CREATE TABLE IF NOT EXISTS corm_responses (
  id          BIGSERIAL PRIMARY KEY,
  environment TEXT NOT NULL DEFAULT 'default',
  corm_id     TEXT NOT NULL,
  session_id  TEXT,
  action_type TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_responses_corm ON corm_responses (environment, corm_id, id);
