# Web

## Overview

The web service is the React single-page application for Frontier Corm. It provides a wallet-connected interface where players manage tribes, create and fill trustless contracts, explore on-chain events, interact with the Continuity Engine (puzzle-service iframe), and view corm state — all backed by the indexer API and direct Sui RPC calls.

## Architecture

```
Browser
┌────────────────────────────────────────────────────┐
│  React SPA (Vite)                                  │
│    ├─ Header / Sidebar / Footer                    │
│    ├─ Pages                                        │
│    │    ├─ Dashboard                               │
│    │    ├─ Tribe (list, detail)                    │
│    │    ├─ Contracts (list, create, detail)        │
│    │    ├─ Continuity Engine (puzzle iframe)       │
│    │    ├─ Event Explorer                          │
│    │    ├─ Structures / Locations                  │
│    │    ├─ Notifications                           │
│    │    └─ Settings                                │
│    ├─ Identity Resolver (Character ↔ Wallet)      │
│    └─ Notification System (payout watcher)        │
└──────────────┬──────────────┬─────────────────────┘
               │              │
       ┌───────┴───┐   ┌─────┴──────┐
       │ Indexer    │   │ Sui RPC    │
       │ REST API  │   │ dapp-kit   │
       └───────────┘   └────────────┘
```

### Key Components

- **Identity Resolver** (`hooks/useIdentity`) — maps the connected Sui wallet to an Eve Frontier Character object. Provides `IdentityContext` to the entire app for character-aware UI.
- **Notification System** (`hooks/useNotifications`, `hooks/usePayoutWatcher`) — push-style notification provider. Payout watcher polls the indexer for contract fill/completion events targeting the current character and surfaces them as toast notifications.
- **Continuity Engine** (`continuity-engine/ContinuityEngine`) — embeds the puzzle-service as an iframe, providing the in-app gateway to the corm interaction.
- **Indexer Error Handler** (`lib/api`) — global subscriber for indexer fetch errors, surfaced as error notifications.

### Page Routes

- `/` — Dashboard (overview)
- `/tribes` — Tribe list
- `/tribe/:tribeId` — Tribe detail (members, reputation leaderboard)
- `/contracts` — Trustless contracts list
- `/contracts/create` — Create new contract
- `/contracts/:contractId` — Contract detail (fills, status)
- `/continuity` — Continuity Engine (puzzle-service iframe)
- `/events` — Event Explorer (filterable event log)
- `/structures` → redirects to `/structures/:characterId`
- `/structures/:characterId` — Player's structures
- `/locations` — Location browser
- `/notifications` — Notification history
- `/settings` — App settings
- `/dapp/*` — Lightweight dApp shell (no sidebar/header) for in-game SSU embedding

## Tech Stack

- **Framework:** React 18 + TypeScript
- **Build:** Vite (multi-mode: `--mode localnet|utopia|stillness`)
- **Routing:** react-router-dom v6
- **Styling:** styled-components + theme provider
- **Data Fetching:** @tanstack/react-query
- **Blockchain:** @mysten/dapp-kit (wallet connection, Sui client), @mysten/sui (transaction building)
- **State:** React context (identity, notifications, sidebar)

## Configuration

All via Vite environment variables (`VITE_*`), resolved in `src/config.ts`:

- `VITE_APP_ENV` — environment: `local`, `utopia`, or `stillness`
- `VITE_SUI_NETWORK` — Sui network: `localnet`, `devnet`, `testnet`
- `VITE_TRIBE_PACKAGE_ID` — tribe contract package ID
- `VITE_TRUSTLESS_CONTRACTS_PACKAGE_ID` — trustless contracts package ID
- `VITE_CORM_AUTH_PACKAGE_ID` — corm_auth package ID
- `VITE_CORM_STATE_PACKAGE_ID` — corm_state package ID
- `VITE_WORLD_PACKAGE_ID` — Eve Frontier world package ID
- `VITE_TRIBE_REGISTRY_ID` — TribeRegistry shared object ID
- `VITE_ENERGY_CONFIG_ID` — energy config shared object ID
- `VITE_CORM_COIN_TYPE` — CORM coin type string
- `VITE_COIN_TYPE` — default coin type for escrow/treasury (default: `0x2::sui::SUI`)
- `VITE_INDEXER_URL` — indexer API base URL (default: `/api/v1`)
- `VITE_WEB_UI_HOST` — public web UI host (for SSU dApp URLs)
- `VITE_WORLD_API_URL` — Eve Frontier world API (tribe name backfill)
- `VITE_PUZZLE_SERVICE_URL` — puzzle service URL (Continuity Engine iframe)
- `VITE_CORM_STATE_ID` — CormState shared object ID

Per-environment defaults are defined in `config.ts` and overridden by explicit `VITE_*` vars. Environment files: `.env.localnet`, `.env.utopia`, `.env.stillness`.

## Deployment

- **Local:** `npm run dev` via `mprocs.yaml` (Vite dev server on :5173, proxies `/api` → indexer)
- **Production:** Static build deployed to S3 behind CloudFront
  - Build: `npm run build -- --mode utopia|stillness`
  - Deploy: `make deploy-frontend ENV=utopia|stillness` (S3 sync + CloudFront invalidation)
  - SPA routing: CloudFront 404 → `/index.html`

## Open Questions / Future Work

- SSU dApp shell (`/dapp/*`) — lightweight embedded view for in-game Smart Storage Units
- Offline-capable PWA for mobile access
- Real-time event streaming (WebSocket from indexer) instead of polling
