# Corm Brain

## Overview

Corm-brain is the reasoning engine for Frontier Corm. It observes player events from one or more game environments (via WebSocket or HTTP fallback from `puzzle-service`), generates contextual responses, and writes corm state transitions to the Sui blockchain. Each corm develops a persistent personality through deterministic trait evolution driven by player interactions.

All response generation is deterministic — no external LLM or DGX Spark dependency.

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
                                   │    ├─ Trait Reduction         │
                                   │    ├─ Phase Transition Gate   │
                                   │    ├─ LLM Stream Response     │
                                   │    │    (transitions only)     │
                                   │    └─ Phase Effects           │
                                   └──────────────────────────────┘
                                        │              │
                                   ┌────┴────┐   ┌────┴────┐
                                   │ Postgres │   │ Sui RPC │
                                   └─────────┘   └─────────┘
```

### Goroutines

1. **Transport Manager** — runs per-environment WebSocket listeners with automatic fallback to HTTP polling when WS disconnects. All environments share a single `eventChan`.
2. **Event Processor** — reads from `eventChan`, debounces events into per-session batches (configurable coalesce window + batch cap), then dispatches to the reasoning handler. Trait reduction runs inline on every event batch. A deterministic transition message is emitted once per phase transition.

### Key Components

- **Text Post-Processor** (`internal/llm/postprocess.go`) — corruption garbling (replaces characters with noise glyphs proportional to corruption level), metadata leak sanitization (strips leaked event field patterns like `row=`, `session_id=`, angle-bracket artifacts, and ellipsis runs), response validation (rejects output without at least one 2+ alpha word), and response truncation.
- **Transition Response Generator** (`internal/reasoning/transitions.go`) — deterministic in-character message selection for phase transitions. Messages are chosen from curated pools via a stable FNV hash of the corm ID, then passed through corruption garbling. No external service required.
- **Trait Reducer** (`internal/memory/reducer.go`) — deterministic trait mutations (stability, corruption, patience, paranoia, volatility, player affinities, agenda weights, contract type affinity) applied inline on every event batch before phase transition detection.
- **Chain Client** (`internal/chain`) — per-environment Sui RPC client for on-chain state writes (phase transitions, stability/corruption updates) using the corm-brain keypair. Includes stubs for contract creation (`contracts.go`), player inventory reading (`inventory.go`), and CORM token minting (`coin.go`).
- **Chain Signer** (`internal/chain/signer.go`) — Ed25519 keypair management for signing Sui transactions.
- **Reasoning Handler** (`internal/reasoning`) — orchestrates the full event→response pipeline: trait reduction, phase transition detection, transition message delivery, and phase effects. A deterministic in-character message is emitted on phase transitions (0→1, 1→2). All other events are processed for side effects only (state sync, hints, boosts, contract generation).

### Phase-Specific Effects

- **Phase 0 Handler** (`internal/reasoning/phase0.go`) — no active side effects. Phase 0→1 transitions are detected centrally by `detectPhaseTransition` in the handler.
- **Phase 1 Handler** (`internal/reasoning/phase1.go`) — handles decrypt and word-submit events:
  - **Struggling Hint** — on every 4th consecutive incorrect submission, highlights a decrypted target-word cell (heatmap) or enables the signal hint globally if no target cells are decrypted yet.
  - **Boost Evaluation** — placeholder for boost targeting based on stability/corruption thresholds.
  - Phase 1→2 transitions (stability reaches 100) are detected centrally by `detectPhaseTransition` in the handler.
- **Phase 2 Handler** (`internal/reasoning/phase2.go`) — handles contract completion/failure with state syncing. Contract generation triggered by any Phase 2 event (rate-limited per corm). Requires a bound `network_node_id` on events to initialize the on-chain `CormState` and populate the world snapshot.

### Test Harness

- **Harness** (`cmd/harness/`) — standalone test tool that impersonates the puzzle-service. Serves a WebSocket endpoint on `/corm/ws` so the corm-brain can connect unmodified, and provides an interactive CLI to inject player events and observe corm-brain responses in real time. Configurable via `HARNESS_PORT`, `HARNESS_SESSION_ID`, `HARNESS_PLAYER_ADDRESS`, `HARNESS_CONTEXT`.

## Tech Stack

- **Language:** Go
- **Database:** PostgreSQL
- **Blockchain:** Sui (via JSON-RPC)
- **Transport:** WebSocket (nhooyr.io/websocket) + HTTP fallback

## Configuration

All via environment variables (see `internal/config/config.go`):

- `DATABASE_URL` — Postgres connection string
- `EVENT_COALESCE_MS` — debounce window (default: 300ms)
- `EVENT_BATCH_MAX` — max events per batch (default: 20)
- `WS_RECONNECT_MAX_MS` — max WS reconnect backoff (default: 30000ms)
- `FALLBACK_POLL_INTERVAL_MS` — HTTP poll interval (default: 2000ms)
- `ENVIRONMENTS_CONFIG` — path to JSON file for multi-environment setup (optional; falls back to single "default" env from legacy vars)
- `SEED_CHAIN_DATA` — when `true`, stub chain methods return hardcoded mock data (CORM balance, inventories, SSUs) instead of zeros, enabling contract generation before real SUI integration (default: true)

Per-environment config (in JSON file): `name`, `puzzle_service_url`, `sui_rpc_url`, `sui_private_key_env`, `corm_state_package_id`.

## Data Model

### Postgres Tables (managed by corm-brain migrations)

- `corm_traits` — per-corm personality state: phase, stability, corruption, agenda weights, patience, player affinities, contract type affinity
- `corm_events` — raw player events with environment, session, payload
- `corm_responses` — logged corm responses for conversational continuity

### On-Chain Objects

- `CormState` — shared object per corm (phase 0–6, stability 0–100, corruption 0–100)

## Deployment

- **Local:** built and run via `mprocs.yaml` using [air](https://github.com/air-verse/air) for live-reload on source changes (see `.air.toml`)
- **Production:** Docker container on ECS Fargate (planned)
- Requires: running Postgres, Sui RPC access, funded Sui keypair

## Features

- Multi-environment support with per-environment WebSocket/HTTP transport
- Deterministic in-character transition responses (no LLM dependency)
- Real-time deterministic trait reduction on every event batch
- Corruption-proportional garbling of transition response text
- Metadata leak sanitization (strips event field patterns from response text)
- Response validation and truncation
- Phase-aware event processing (Phase 0 dormancy, Phase 1 puzzles, Phase 2 contracts)
- Phase-transition-only corm responses (one deterministic in-character message per transition)
- Struggling player hint system (auto-activates on repeated failures)
- On-chain state writes (phase transitions, stability/corruption updates)
- Chain stubs for contract creation, inventory reading, and CORM minting
- Seed chain data mode (`SEED_CHAIN_DATA`) for development without live SUI
- Network node binding via `node_bind` event (triggered by puzzle-service Phase 2 UI)
- Network node recovery for returning players via `phase2_load` event and `state_sync` with `network_node_id`
- Interactive test harness for local development

## Phase 2 Contract Generation

The corm generates trustless contracts for players to execute in the game world. Contract generation uses a deterministic, trait-driven architecture with no LLM in the critical path.

### Deterministic Generation Architecture
1. **Trait-weighted intent** — `reasoning/contract_gen.go:GenerateContractIntent` produces a `ContractIntent` deterministically from corm traits (`agenda_weights`, `contract_type_affinity`, `patience`, `paranoia`, `corruption`, `player_affinities`) and actual inventory state. Contract type is selected via weighted random (affinity + agenda alignment). Items are picked directly from `WorldSnapshot` inventories, eliminating hallucination. Qualitative scales (quantity, urgency, CORM amount) are derived from trait values.
2. **Go resolves to exact params** — the intent resolver (`reasoning/resolver.go`) maps item names to type IDs via fuzzy registry lookup, converts qualitative scale hints to exact quantities, computes CORM amounts from LUX-based item valuations, and applies divisibility constraints.
3. **Validation gate** — `ValidateParams` checks hard constraints (balance, divisibility, deadline, contract cap) and silently fixes correctable issues before the chain write.
4. **Generic narrative** — `genericNarrative()` produces a deterministic in-character description from the contract intent. No LLM call in the contract path.

### Item Type Registry (`chain/registry.go`)
Startup-loaded from `static-data/data/phobos/fsd_built/types.json` + `groups.json`. Published items only (628). Joined with LUX valuations from `corm-brain/data/item-values.json` (build artifact from `scripts/build-item-values.mjs`).

### LUX → CORM Pricing
CORM amounts are derived from time-to-produce valuations (~100K LUX/hour mining rate). Formula: `quantity × luxValue × CORM_PER_LUX × scaleMultiplier × alignmentBonus × corruptionPenalty`. Configurable via `CORM_PER_LUX` (default: 1.0) and `CORM_FLOOR_PER_UNIT` (default: 10) env vars.

### World State Snapshot (`chain/snapshot.go`)
Before each contract generation, chain state is fetched in parallel: corm CORM balance, corm SSU inventory, player SSU inventory, network node SSUs. Best-effort — missing data means fewer contract options, not failure.

**Seed mode:** When `SEED_CHAIN_DATA=true` (default in dev), stub methods return hardcoded mock data: 10,000 CORM balance, a small inventory of common items (Crude Mineral, Ferric Ore, Coolant), player items (Refined Crystal, Crude Mineral, Fuel Cell), and one synthetic SSU per node. This unblocks contract generation before real SUI integration.

### Network Node Binding
Contract generation requires a `network_node_id` on events so the corm can be linked to a CormState on-chain. The puzzle-service Phase 2 UI includes a binding form (`POST /phase2/bind-node`) that stores the node ID on the session and emits a `node_bind` event. For SSU sessions, the node ID is auto-extracted from the session context (`ssu:<entity_id>`). Once bound, all subsequent events carry the `network_node_id`, enabling the corm-brain event processor to resolve/create the CormState and populate the world snapshot.

### Network Node Recovery for Returning Players
Since puzzle-service sessions are ephemeral, a returning player's network node binding is lost when their session expires. To resolve this, `StateSyncPayload` includes an optional `network_node_id` field. `ResolveNetworkNodeByCorm` (`db/queries.go`) performs a reverse lookup from `corm_id` → primary network node (with fallback to oldest node by `linked_at`). All `state_sync` emissions use `buildStateSyncPayload` (`reasoning/handler.go`) which resolves and includes the network node.

The puzzle-service emits a `phase2_load` event on every `GET /phase2` page load. The corm-brain `runPhaseEffects` handler responds immediately with a `state_sync` carrying the resolved network node ID. The puzzle-service SSE handler updates the session and performs an OOB swap to replace the bind form with the linked indicator.

### Contract Types (Phase 2)
- **CoinForItem** — corm pays CORM, wants items from player
- **ItemForCoin** — corm offers items, wants CORM from player
- **ItemForItem** — corm offers items, wants different items
- **CORMGiveaway** — corm distributes CORM for free (CoinForCoin with wanted_amount=0)
- **Transport** — deferred (single-node isolation makes source=destination)

All coin types are `Coin<CORM>`.

### Reducer Updates
`reduceContractComplete` now parses `contract_type` from the event payload and updates `contract_type_affinity` and `agenda_weights` (trade → industry, transport → expansion). Agenda weights are normalized after each update.

## Network Linking (Phase 4)

Corms expand by linking with other corms when gates connect their network nodes. Three linking models are defined; **Absorption** is the initial implementation.

### Absorption (Implemented)
The older corm (by primary node `linked_at` timestamp) absorbs the younger. The primary node is always the **oldest** network node in a corm.

**On link detection (gate activation event):**
1. Resolve both network nodes to their respective `corm_id` via `corm_network_nodes`.
2. Determine primary by earliest `linked_at` where `is_primary = true`.
3. Remap absorbed corm's network nodes: `UPDATE corm_network_nodes SET corm_id = :primary_corm_id, is_primary = false WHERE corm_id = :absorbed_corm_id`.
4. Import absorbed memories into primary with `importance *= 0.7` and `memory_type = 'absorbed'`.
5. Merge traits via weighted average (weighted by `COUNT(*)` from `corm_events` per corm).
6. Insert a record into `corm_link_history` for audit.
7. The absorbed `CormState` on-chain is no longer updated.

**Vulnerability:** Destroying the primary network node kills the corm — all subservient nodes lose their identity.

### Hive Mind (Future)
Each node keeps its own `corm_traits` but shares a synchronized agenda. No single primary — all nodes are peers. Destroying a node loses that node's traits and interaction history but the hive persists.

### Mutual Dissolution (Future)
Both corms dissolve into a new entity with reset traits and clean memory. The oldest node becomes the new primary. Most resilient — destroying the primary triggers a new dissolution (next-oldest node takes over), but each dissolution resets accumulated personality.

### Primary Node Resolution
The primary node is determined by `SELECT network_node_id FROM corm_network_nodes WHERE corm_id = :id AND is_primary = true`. On corm creation, the first node is automatically marked primary. On absorption, only the absorbing corm's primary retains `is_primary = true`.

### Schema Changes
See migration `002_network_linking.sql`:
- `corm_network_nodes.is_primary` — boolean, marks the primary node per corm
- `corm_network_nodes.link_type` — enum-like text: `'origin'`, `'absorption'`, `'hive'`, `'dissolution'`
- `corm_link_history` — audit log of all linking events

## Open Questions / Future Work

- Production Dockerfile and ECS task definition
- Multi-corm support (one corm-brain per network node)
- Trait evolution via LLM reflection (beyond deterministic reducers)
- On-chain MintCap usage for CORM token rewards
- Full implementation of chain stubs (contract creation, inventory reading, CORM minting)
- Boost system implementation (cell targeting based on decrypt patterns)
- Location reporting witnessed contract (prerequisite for cross-node transport)
- Phase 3 agenda-driven multi-step contract sequences
- On-chain `CormLinkedEvent` emission and dormant CormState marking for absorbed corms
- Hive Mind linking: per-node traits with shared agenda synchronization
- Mutual Dissolution linking: trait reset + memory archival + new CormState provisioning
- Node destruction detection and corm death/dissolution cascade
