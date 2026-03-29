-- 002_network_linking.sql — network linking schema for Phase 4+ corm expansion

-- Mark the primary (oldest) network node per corm.
-- On corm creation the first node is primary. On absorption, only the
-- absorbing corm's primary retains is_primary = true.
ALTER TABLE corm_network_nodes
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Linking type for this node's relationship to its corm.
--   'origin'      — the node that created the corm (always the first node)
--   'absorption'  — node was absorbed into an existing corm
--   'hive'        — node participates in a hive-mind cluster (future)
--   'dissolution' — node is part of a dissolved/reformed corm (future)
ALTER TABLE corm_network_nodes
  ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'origin';

-- Back-fill: mark existing rows as primary origins (single-node corms).
UPDATE corm_network_nodes SET is_primary = true, link_type = 'origin'
  WHERE is_primary = false;

-- Audit log for all linking events (append-only).
CREATE TABLE IF NOT EXISTS corm_link_history (
  id                BIGSERIAL PRIMARY KEY,
  environment       TEXT NOT NULL DEFAULT 'default',
  link_type         TEXT NOT NULL,            -- 'absorption', 'hive', 'dissolution'
  primary_corm_id   TEXT NOT NULL,            -- the surviving / new corm
  absorbed_corm_id  TEXT,                     -- the corm that was absorbed (NULL for dissolution)
  primary_node_id   TEXT NOT NULL,            -- the primary network node after linking
  absorbed_node_ids JSONB,                    -- array of network_node_ids that were remapped
  metadata          JSONB,                    -- extra context (trait merge weights, etc.)
  linked_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corm_link_history_env
  ON corm_link_history (environment, primary_corm_id);
