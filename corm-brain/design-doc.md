# Corm Brain

## Overview

Corm-brain is the AI reasoning engine for Frontier Corm. It observes player events from one or more game environments (via WebSocket or HTTP fallback from `puzzle-service`), generates contextual responses using locally-hosted LLMs (NVIDIA TRT-LLM on DGX Spark), and writes corm state transitions to the Sui blockchain. Each corm develops a persistent personality through episodic memory and trait evolution.

## Architecture

```
puzzle-service (per env)           corm-brain
┌──────────────────┐     WS/HTTP    ┌──────────────────────────────┐
│  /corm/ws        │ ◄───────────► │  Transport Manager           │
│  /corm/events    │               │    ├─ WSClient (per env)      │
│  /corm/action    │               │    ├─ FallbackClient (per env)│
└──────────────────┘               │    └─ ActionSender (per env)  │
                                   ├──────────────────────────────┤
                                   │  Event Processor              │
                                   │    └─ Debounce → GroupBySession│
                                   ├──────────────────────────────┤
                                   │  Reasoning Handler            │
                                   │    ├─ Response Gating         │
                                   │    ├─ Memory Retrieval        │
                                   │    ├─ LLM Prompt → Stream     │
                                   │    └─ Phase Effects           │
                                   ├──────────────────────────────┤
                                   │  Consolidation Loop           │
                                   │    ├─ LLM Summarization       │
                                   │    ├─ Embedding + pgvector    │
                                   │    └─ Trait Reduction          │
                                   └──────────────────────────────┘
                                        │              │
                                   ┌────┴────┐   ┌────┴────┐
                                   │ Postgres │   │ Sui RPC │
                                   │ pgvector │   │  Chain  │
                                   └─────────┘   └─────────┘
```

### Goroutines

1. **Transport Manager** — runs per-environment WebSocket listeners with automatic fallback to HTTP polling when WS disconnects. All environments share a single `eventChan`.
2. **Event Processor** — reads from `eventChan`, debounces events into per-session batches (configurable coalesce window + batch cap), then dispatches one LLM call per session group.
3. **Consolidation Loop** — periodic sweep across all environments/corms. Summarizes unconsolidated events into episodic memories via LLM, generates embeddings, runs deterministic trait reducers, and prunes memories exceeding the per-corm cap.

### Key Components

- **LLM Client** (`internal/llm`) — dual-endpoint client targeting Super (deep reasoning, port 8000) and Nano (fast extraction, port 8001) TRT-LLM models. Supports streaming and sync completion with optional reasoning disable.
- **Embedder** (`internal/embed`) — local nomic-embed model for memory vector generation. Supports single and batch embedding.
- **Memory Retriever** (`internal/memory`) — pgvector cosine similarity search over episodic memories. Touches recalled memories to update recency scoring.
- **Memory Consolidator** (`internal/memory`) — LLM-driven event summarization → embedding → storage. Deterministic trait reduction (agenda weights, patience, player affinities). Prunes oldest/least-important memories when over cap.
- **Chain Client** (`internal/chain`) — per-environment Sui RPC client for on-chain state writes (phase transitions, stability/corruption updates) using the corm-brain keypair.
- **Reasoning Handler** (`internal/reasoning`) — orchestrates the full event→response pipeline: trait lookup, response gating (cooldown + low-significance accumulation), memory recall, prompt building, LLM streaming, response delivery, and phase effects.

## Tech Stack

- **Language:** Go
- **LLM Inference:** NVIDIA TRT-LLM (Nemotron 3 Super/Nano) hosted on DGX Spark
- **Embedding:** nomic-embed (local GGUF via cgo)
- **Database:** PostgreSQL + pgvector
- **Blockchain:** Sui (via JSON-RPC)
- **Transport:** WebSocket (nhooyr.io/websocket) + HTTP fallback

## Configuration

All via environment variables (see `internal/config/config.go`):

- `LLM_SUPER_URL` / `LLM_FAST_URL` — TRT-LLM endpoints (default: localhost:8000/8001)
- `EMBED_MODEL_PATH` — path to nomic-embed GGUF model
- `DATABASE_URL` — Postgres connection string
- `EVENT_COALESCE_MS` — debounce window (default: 300ms)
- `EVENT_BATCH_MAX` — max events per batch (default: 20)
- `RESPONSE_COOLDOWN_MS` — min time between responses per session (default: 3000ms)
- `LOW_SIG_ACCUMULATION` — low-sig events before responding (default: 4)
- `CONSOLIDATION_INTERVAL_MS` — memory sweep interval (default: 60000ms)
- `MEMORY_CAP_PER_CORM` — max episodic memories per corm (default: 500)
- `WS_RECONNECT_MAX_MS` — max WS reconnect backoff (default: 30000ms)
- `FALLBACK_POLL_INTERVAL_MS` — HTTP poll interval (default: 2000ms)
- `ENVIRONMENTS_CONFIG` — path to JSON file for multi-environment setup (optional; falls back to single "default" env from legacy vars)

Per-environment config (in JSON file): `name`, `puzzle_service_url`, `sui_rpc_url`, `sui_private_key_env`, `corm_state_package_id`.

## Data Model

### Postgres Tables (managed by corm-brain migrations)

- `corm_traits` — per-corm personality state: phase, stability, corruption, agenda weights, patience, player affinities, contract type affinity, consolidation checkpoint
- `corm_events` — raw player events with environment, session, payload
- `corm_responses` — logged corm responses for conversational continuity
- `corm_memories` — episodic memories with pgvector embeddings, importance, type, source events, last-recalled timestamp

### On-Chain Objects

- `CormState` — shared object per corm (phase 0–6, stability 0–100, corruption 0–100)

## Deployment

- **Local:** built and run via `mprocs.yaml` (`go build -o ./corm-brain .`)
- **Production:** Docker container on ECS Fargate (planned)
- Requires: running Postgres with pgvector, DGX Spark LLM tunnel, Sui RPC access, funded Sui keypair

## Open Questions / Future Work

- Production Dockerfile and ECS task definition
- Multi-corm support (one corm-brain per network node)
- Trait evolution via LLM reflection (beyond deterministic reducers)
- On-chain MintCap usage for CORM token rewards
