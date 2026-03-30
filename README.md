# Frontier Corm

AI-powered autonomous NPC system for [Eve Frontier](https://evefrontier.com) on Sui. Corms are persistent AI entities that live on network nodes — they awaken through player interaction, evolve personality traits through episodic memory, generate trustless on-chain contracts, and expand by linking with other corms.

## Architecture

```
Browser                         Off-chain                          On-chain (Sui)
┌──────────────┐          ┌─────────────────┐              ┌──────────────────────┐
│  Web (React) │─────────►│  Indexer (TS)   │◄── events ──│  Contracts (Move)    │
│  :5173       │  REST    │  :3100          │              │  ├─ corm_auth        │
│              │◄─────────│  ├─ Event API   │              │  ├─ corm_state       │
│              │          │  ├─ Location API│              │  ├─ tribe            │
│              │          │  ├─ ZK Proofs   │              │  ├─ trustless_*      │
│              │──────────│  ├─ Witness Svc │── fulfill ──►│  ├─ witnessed_*      │
│              │  dapp-kit│  └─ Cleanup     │── expire ──►│  └─ assembly_metadata│
│              │─────────►│                 │              └──────────────────────┘
└──────┬───────┘          └─────────────────┘
       │ iframe                    ▲ Postgres (pgvector)
┌──────┴───────┐                   │
│ Continuity   │───────────────────┘
│ Engine (Go)  │
│ :3300        │── state ──► Sui RPC
│ Phase 0/1/2  │
│ Traits+Reason│
└──────────────┘
```

## Repository Structure

| Directory | Description | Details |
|-----------|-------------|---------|
| `contracts/` | Sui Move smart contracts — corm identity, tribes, trustless exchanges, witnessed bounties | [design-doc](contracts/design-doc.md) |
| `continuity-engine/` | Go game server + reasoning engine — three-phase Continuity Engine, deterministic trait evolution, on-chain writes | [design-doc](continuity-engine/design-doc.md) |
| `indexer/` | TypeScript event archiver + REST API — checkpoint proofs, reputation, shadow locations, ZK proofs | [design-doc](indexer/design-doc.md) |
| `web/` | React SPA — tribes, contracts, forge planner, locations, Continuity Engine iframe | [design-doc](web/design-doc.md) |
| `infra/` | AWS CDK stack — ECS Fargate, RDS, S3, CloudFront, Route 53 | [design-doc](infra/design-doc.md) |
| `static-data/` | Eve Frontier game data (Phobos exports, icons, item enrichment) | [design-doc](static-data/design-doc.md) |
| `training-data/` | LLM fine-tuning pipeline — lore scraping, dataset curation, training scripts | [design-doc](training-data/design-doc.md) |
| `dev-tools/` | Developer utilities — local wallet extension, item giver, package search, contract tracker | [design-doc](dev-tools/design-doc.md) |
| `scripts/` | Shared shell/JS/TS scripts — contract publishing, seeding, DGX management | — |
| `plan/` | Design documents and phase planning | — |

## Prerequisites

- **Node.js** (v18+) — indexer, web, scripts
- **Go** (1.22+) — continuity-engine
- **Sui CLI** — contract publishing and local network
- **Docker** + **Docker Compose** — local Postgres, containerized services
- **mprocs** — local dev orchestration (`cargo install mprocs`)
- **air** — Go live-reload for continuity-engine (`go install github.com/air-verse/air@latest`)

For deployment only:
- **AWS CLI** + **AWS CDK** — infrastructure provisioning
- **Python 3** — static-data extraction scripts

## Quick Start (Local Dev)

### Full stack with mprocs (recommended)

```bash
cp .env.example .env
mprocs
```

mprocs starts services in dependency order:

1. **sui-localnet** — local Sui network with faucet
2. **postgres** — PostgreSQL via docker compose
3. **world-contracts** — deploys Eve Frontier world contracts
4. **contracts-publish** — publishes Frontier Corm contracts (writes package IDs to `.env.localnet`)
5. **indexer** — event subscriber + API on `:3100`
6. **web** — Vite dev server on `:5173`
7. **continuity-engine** — Continuity Engine on `:3300`

### Docker-only subset

```bash
cp .env.example .env
make local          # indexer + postgres + continuity-engine
make local-down     # stop (keep data)
make local-reset    # stop + delete volumes
```

## Environment Configuration

| File | Purpose |
|------|---------|
| `.env.example` | Template — copy to `.env` for local dev |
| `.env.localnet` | Auto-generated by contract publish scripts (package IDs, object IDs) |
| `.env.utopia.example` | Template for Utopia testnet deployment |
| `.env.stillness.example` | Template for Stillness testnet deployment |

Key variables: `SUI_RPC_URL`, `PACKAGE_*` (contract IDs), `VITE_*` (web app), `DATABASE_URL`, `EVENT_COALESCE_MS`, `SUI_PRIVATE_KEY` (continuity-engine). See each service's design doc for full configuration details.

## Deployment

All deployments are driven by the Makefile and target AWS (ECS Fargate, S3, CloudFront, RDS):

```bash
make infra-init                   # First-time CDK bootstrap
make deploy-env ENV=utopia        # Deploy everything (infra + images + frontend)
make deploy-images ENV=utopia     # Build + push Docker images to ECR
make deploy-frontend ENV=utopia   # Build frontend + S3 sync + CloudFront invalidation
make publish-contracts ENV=utopia # Publish Move contracts to testnet
make teardown ENV=utopia          # Destroy all AWS resources
```

Shorthands: `make deploy-utopia`, `make deploy-stillness`, `make publish-utopia`, `make publish-stillness`.

See [infra/design-doc.md](infra/design-doc.md) for full AWS architecture details.

## Useful Make Targets

```
make help              Show all targets
make local             Start local dev (docker compose)
make build             Build all TypeScript projects
make clean             Remove build artifacts
make enrich-items      Enrich items.json with game metadata
make seed-ores         Seed ore items into SSU for testing
make zk-build          Build Groth16 ZK circuit artifacts
```

Run `make help` for the complete list.

## Resources

- [Eve Frontier Developer Docs](https://docs.evefrontier.com)
- [Eve Frontier World Contracts](https://github.com/evefrontier/world-contracts)

> **Note:** Eve Frontier is migrating from EVM to SUI. Some external resources may still reference EVM patterns.
