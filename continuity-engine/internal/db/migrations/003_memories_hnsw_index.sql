-- 003_memories_hnsw_index.sql — replace IVFFlat with HNSW
-- IVFFlat builds clustering at creation time and produces a degenerate index
-- on an empty table. HNSW works correctly regardless of table size.
DROP INDEX IF EXISTS idx_corm_memories_embedding;
CREATE INDEX IF NOT EXISTS idx_corm_memories_embedding ON corm_memories
  USING hnsw (embedding vector_cosine_ops);
