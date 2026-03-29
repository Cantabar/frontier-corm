# Indexer

## Overview

The indexer is an off-chain TypeScript service that subscribes to Sui on-chain events from all Frontier Corm contract modules, archives them with checkpoint inclusion proofs for long-term verifiability, and serves a REST API for historical queries. It also runs an optional cleanup worker that expires and cancels stale on-chain contracts.

## Architecture

```
Sui Checkpoints → Checkpoint Subscriber → Event Archiver → Postgres
                                                              ↓
                                              Express API ← Query Layer

                  Cleanup Worker → Sui RPC (cancel/expire stale contracts)
```

### Components

- **Checkpoint Subscriber** (`subscriber/checkpoint-subscriber.ts`) — polls Sui RPC for events from the `tribe`, `trustless_contracts`, `witnessed_contracts`, and `corm_state` packages. Each event is enriched with checkpoint metadata (sequence, digest, timestamp). Maintains a resumable cursor in the database.
- **Event Archiver** (`archiver/event-archiver.ts`) — writes events with denormalized fields (`tribe_id`, `character_id`, `primary_id`) and updates materialized views (reputation snapshots).
- **Express API** (`api/server.ts`) — serves historical queries, reputation audit trails, and checkpoint inclusion proofs on the configured port.
- **Cleanup Worker** (`cleanup/cleanup-worker.ts`) — optional background process that finds expired contracts on-chain and submits cancel/expire transactions using a funded keypair.
- **Witness Service** (`witness/witness-service.ts`) — signs `BuildAttestation` messages for witnessed contract fulfillment when on-chain structure events match open build requests.

### Tracked Events (20+)

- **Tribe (8):** TribeCreatedEvent, MemberJoinedEvent, MemberRemovedEvent, ReputationUpdatedEvent, TreasuryDepositEvent, TreasuryProposalCreatedEvent, TreasuryProposalVotedEvent, TreasurySpendEvent
- **Trustless Contracts (11):** CoinForCoinCreatedEvent, CoinForItemCreatedEvent, ItemForCoinCreatedEvent, ItemForItemCreatedEvent, TransportCreatedEvent, ContractFilledEvent, ContractCompletedEvent, ContractCancelledEvent, ContractExpiredEvent, TransportAcceptedEvent, TransportDeliveredEvent
- **Multi-Input (5):** MultiInputContractCreatedEvent, SlotFilledEvent, MultiInputContractCompletedEvent, MultiInputContractCancelledEvent, MultiInputContractExpiredEvent

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Database:** PostgreSQL (with location tables)
- **HTTP Framework:** Express
- **Blockchain:** Sui JSON-RPC (`@mysten/sui`)
- **ZK:** Groth16 circuits for region/proximity location proofs (optional, `circuits/`)

## Configuration

Environment variables (all optional with defaults):

- `SUI_RPC_URL` — Sui RPC endpoint (default: `http://127.0.0.1:9000`)
- `PACKAGE_TRIBE` — deployed tribe package ID
- `PACKAGE_TRUSTLESS_CONTRACTS` — deployed trustless_contracts package ID
- `PACKAGE_CORM_STATE` — deployed corm_state package ID
- `DATABASE_URL` — Postgres connection string (default: `postgresql://corm:corm@localhost:5432/frontier_corm`)
- `API_PORT` — API server port (default: 3100)
- `POLL_INTERVAL_MS` — event poll interval (default: 2000)
- `CLEANUP_ENABLED` — enable cleanup worker (default: false)
- `CLEANUP_WORKER_PRIVATE_KEY` — Sui keypair for contract cleanup transactions

## API / Interface

All routes under `/api/v1`. Pagination via `?limit=50&offset=0&order=desc`.

- `GET /health` — health check
- `GET /stats` — indexer statistics
- `GET /events` — all events (optional `?type=EventTypeName`)
- `GET /events/tribe/:tribeId` — events for a tribe
- `GET /events/character/:characterId` — events involving a character
- `GET /events/object/:objectId` — events for a specific object
- `GET /reputation/:tribeId/:characterId` — current reputation + audit trail with proofs
- `GET /reputation/:tribeId/leaderboard` — top members by reputation
- `GET /proof/:eventId` — checkpoint inclusion proof for a single event
- `GET /event-types` — list of all tracked event types

## Data Model

### Postgres Tables

- `events` — all archived events with checkpoint proof metadata (`tx_digest`, `event_seq`, `checkpoint_seq`, `checkpoint_digest`), denormalized fields, raw JSON payload
- `reputation_snapshots` — materialized latest reputation per tribe×character
- `indexer_cursor` — resumable polling cursor
- Location tables (managed by `db/location-schema.ts`)

### Checkpoint Proof Verification

Each archived event includes proof metadata for independent verification:
1. Confirm `checkpoint_digest` is signed by ≥2/3 validators for the epoch
2. Confirm `tx_digest` is included in the checkpoint's transaction list
3. Confirm event data matches the event emitted by `tx_digest` at `event_seq`

## Deployment

- **Local:** `npm run dev` via `mprocs.yaml` (waits for Postgres + Sui + contract publish)
- **Production:** Docker container on ECS Fargate behind an ALB
  - ECR repository: `fc-{env}-indexer`
  - Build: `docker build -t <ecr-uri>:latest ./indexer`
  - Deploy: `make deploy-images` (pushes to ECR + forces ECS redeployment)
- Database: RDS Postgres (managed by CDK stack)

## Open Questions / Future Work

- ZK location proofs (Groth16 circuits for region/proximity verification) — artifacts in `circuits/`
- Witness service integration with additional witnessed contract types
- Event replay / reindexing tooling
- Read replica support for API scaling
