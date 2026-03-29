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
                                   │    ├─ Observation Rate Limit  │
                                   │    ├─ Memory Retrieval        │
                                   │    ├─ LLM Observe → [SILENCE] │
                                   │    │    or Stream Response     │
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
- **LLM Post-Processor** (`internal/llm/postprocess.go`) — corruption garbling (replaces characters with noise glyphs proportional to corruption level), metadata leak sanitization (strips leaked event field patterns like `row=`, `session_id=`, angle-bracket artifacts, and ellipsis runs), response validation (rejects output without at least one 2+ alpha word), and response truncation.
- **Embedder** (`internal/embed`) — local nomic-embed model for memory vector generation. Supports single and batch embedding.
- **Memory Retriever** (`internal/memory`) — pgvector cosine similarity search over episodic memories. Touches recalled memories to update recency scoring.
- **Memory Consolidator** (`internal/memory`) — LLM-driven event summarization → embedding → storage. Deterministic trait reduction (agenda weights, patience, player affinities).
- **Memory Pruner** (`internal/memory/pruner.go`) — enforces per-corm memory caps by removing lowest-ranked memories when a corm exceeds its limit.
- **Chain Client** (`internal/chain`) — per-environment Sui RPC client for on-chain state writes (phase transitions, stability/corruption updates) using the corm-brain keypair. Includes stubs for contract creation (`contracts.go`), player inventory reading (`inventory.go`), and CORM token minting (`coin.go`).
- **Chain Signer** (`internal/chain/signer.go`) — Ed25519 keypair management for signing Sui transactions.
- **Reasoning Handler** (`internal/reasoning`) — orchestrates the full event→response pipeline: trait lookup, observation rate limiting (interval + jitter, not significance gating), memory recall, prompt building, LLM observation call (model decides via `[SILENCE]` whether to respond), response delivery, and phase effects. The LLM sees all events continuously and decides both *whether* and *what* to say.

### Phase-Specific Effects

- **Phase 0 Handler** (`internal/reasoning/phase0.go`) — observes phase transition events. When the puzzle-service detects the frustration trigger (3+ clicks on same button within 2 seconds), persists the phase=1 transition and syncs state.
- **Phase 1 Handler** (`internal/reasoning/phase1.go`) — handles decrypt and word-submit events with three active systems:
  - **Struggling Hint** — on every 4th consecutive incorrect submission, highlights a decrypted target-word cell (heatmap) or enables the signal hint globally if no target cells are decrypted yet.
  - **Guided Cell** — probabilistic (~25% per decrypt, reduced by corruption) system that sends a `guide_cell` action pointing the player toward the target, with distance-aware offset and alternating heatmap/vectors hint types. Immediately streams a directional narration via a dedicated LLM call.
  - **Boost Evaluation** — placeholder for boost targeting based on stability/corruption thresholds.
  - **Phase Transition** — transitions to Phase 2 when stability reaches 100.
- **Phase 2 Handler** (`internal/reasoning/phase2.go`) — handles contract completion/failure with state syncing. Contract generation logic (inventory reading, LLM-driven type selection, on-chain creation) is outlined but deferred.

### Test Harness

- **Harness** (`cmd/harness/`) — standalone test tool that impersonates the puzzle-service. Serves a WebSocket endpoint on `/corm/ws` so the corm-brain can connect unmodified, and provides an interactive CLI to inject player events and observe corm-brain responses in real time. Configurable via `HARNESS_PORT`, `HARNESS_SESSION_ID`, `HARNESS_PLAYER_ADDRESS`, `HARNESS_CONTEXT`.

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
- `LLM_MAX_TOKENS_FAST` — max generation tokens for Phase 0/1 streaming (default: 60)
- `LLM_MAX_TOKENS_DEFAULT` — max generation tokens for standard streaming (default: 150)
- `LLM_MAX_TOKENS_DEEP` — max generation tokens for deep reasoning streaming (default: 400)
- `LLM_MAX_TOKENS_SYNC` — max generation tokens for sync consolidation (default: 500)
- `EMBED_MODEL_PATH` — path to nomic-embed GGUF model
- `DATABASE_URL` — Postgres connection string
- `EVENT_COALESCE_MS` — debounce window (default: 300ms)
- `EVENT_BATCH_MAX` — max events per batch (default: 20)
- `OBSERVATION_INTERVAL_MS` — min time between LLM observation calls per session (default: 4000ms)
- `OBSERVATION_JITTER_MS` — random jitter added to observation interval (default: 2000ms)
- `CRITICAL_EVENT_BYPASS` — phase transitions and correct submissions bypass interval (default: true)
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

- **Local:** built and run via `mprocs.yaml` using [air](https://github.com/air-verse/air) for live-reload on source changes (see `.air.toml`)
- **Production:** Docker container on ECS Fargate (planned)
- Requires: running Postgres with pgvector, DGX Spark LLM tunnel, Sui RPC access, funded Sui keypair

## Features

- Multi-environment support with per-environment WebSocket/HTTP transport
- Dual LLM inference (Super for deep reasoning, Nano for fast extraction)
- Local nomic-embed vector generation for episodic memories
- Corruption-proportional garbling of LLM output
- Metadata leak sanitization (strips event field patterns from LLM output)
- Response validation and truncation
- Memory consolidation with LLM summarization, embedding, and trait reduction
- Memory pruning with configurable per-corm caps
- Phase-aware event processing (Phase 0 dormancy, Phase 1 puzzles, Phase 2 contracts)
- Struggling player hint system (auto-activates on repeated failures)
- Guided cell system with directional narration streaming
- On-chain state writes (phase transitions, stability/corruption updates)
- Chain stubs for contract creation, inventory reading, and CORM minting
- Interactive test harness for local development

## Phase 2 Contract Generation

The corm generates trustless contracts for players to execute in the game world. Contract generation uses a two-stage architecture to separate creative decisions from parameter precision.

### Two-Stage Architecture
1. **Super generates intent** — given corm traits, episodic memories, and a world state snapshot, the Super model produces a structured `ContractIntent` (JSON) specifying contract type, item names, qualitative amounts, urgency, and narrative flavor text.
2. **Go resolves to exact params** — the intent resolver (`reasoning/resolver.go`) maps item names to type IDs via fuzzy registry lookup, converts qualitative scale hints to exact quantities, computes CORM amounts from LUX-based item valuations, and applies divisibility constraints.
3. **Validation gate** — `ValidateParams` checks hard constraints (balance, divisibility, deadline, contract cap) and silently fixes correctable issues before the chain write.

### Item Type Registry (`chain/registry.go`)
Startup-loaded from `static-data/data/phobos/fsd_built/types.json` + `groups.json`. Published items only (628). Joined with LUX valuations from `corm-brain/data/item-values.json` (build artifact from `scripts/build-item-values.mjs`).

### LUX → CORM Pricing
CORM amounts are derived from time-to-produce valuations (~100K LUX/hour mining rate). Formula: `quantity × luxValue × CORM_PER_LUX × scaleMultiplier × alignmentBonus × corruptionPenalty`. Configurable via `CORM_PER_LUX` (default: 1.0) and `CORM_FLOOR_PER_UNIT` (default: 10) env vars.

### World State Snapshot (`chain/snapshot.go`)
Before each contract generation, chain state is fetched in parallel: corm CORM balance, corm SSU inventory, player SSU inventory, network node SSUs. Best-effort — missing data means fewer contract options, not failure.

### Contract Types (Phase 2)
- **CoinForItem** — corm pays CORM, wants items from player
- **ItemForCoin** — corm offers items, wants CORM from player
- **ItemForItem** — corm offers items, wants different items
- **CORMGiveaway** — corm distributes CORM for free (CoinForCoin with wanted_amount=0)
- **Transport** — deferred (single-node isolation makes source=destination)

All coin types are `Coin<CORM>`. The LLM never selects a coin type.

### Reducer Updates
`reduceContractComplete` now parses `contract_type` from the event payload and updates `contract_type_affinity` and `agenda_weights` (trade → industry, transport → expansion). Agenda weights are normalized after each update.

## Open Questions / Future Work

- Production Dockerfile and ECS task definition
- Multi-corm support (one corm-brain per network node)
- Trait evolution via LLM reflection (beyond deterministic reducers)
- On-chain MintCap usage for CORM token rewards
- Full implementation of chain stubs (contract creation, inventory reading, CORM minting)
- Boost system implementation (cell targeting based on decrypt patterns)
- Location reporting witnessed contract (prerequisite for cross-node transport)
- Phase 3 agenda-driven multi-step contract sequences
