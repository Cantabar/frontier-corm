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
- **Continuity Engine** (`continuity-engine/ContinuityEngine`) — embeds the puzzle-service as an iframe, providing the in-app gateway to the corm interaction. Includes `useCormState` and `useCormStateBridge` hooks for reading on-chain CormState and bridging it to the iframe, plus a `CormStateBar` component.
- **Auto-Join Tribe** (`hooks/useAutoJoinTribe`) — detects when the connected wallet’s Character belongs to an in-game tribe that has an on-chain Tribe, but the user hasn’t joined yet. Resolves via indexer events or on-chain registry lookup (`devInspect`). Exposes a one-click `self_join` action. Displayed via `AutoJoinBanner`.
- **Initialize Tribe** (`hooks/useInitializeTribe`, `InitializeTribeBanner`) — detects when the user’s in-game tribe has no on-chain Tribe and prompts creation.
- **Quick Actions** (`hooks/useQuickActions`) — configurable dashboard shortcuts for contract creation (CoinForCoin, CoinForItem, ItemForCoin, ItemForItem, Transport). Persisted to localStorage.
- **Indexer Error Handler** (`lib/api`) — global subscriber for indexer fetch errors, surfaced as error notifications.

### Shadow Location Network

Client-side privacy-preserving location sharing with ZK proof generation. The server never sees plaintext coordinates.

- **Location Crypto** (`lib/locationCrypto.ts`) — Poseidon4 hash commitment, AES-256-GCM encrypt/decrypt with TLK, X25519 TLK unwrap (ECIES), signature-derived X25519 keypair (deterministic from wallet’s `signPersonalMessage`), wallet auth challenge construction.
- **ZK Prover** (`lib/zkProver.ts`) — browser-side Groth16 proof generation via snarkjs. Generates region-filter proofs (3D bounding box containment), proximity-filter proofs (distance threshold), and mutual proximity proofs (two-structure distance within threshold). Circuit WASM + zkey files served by the indexer at `/zk/`.
- **Location PODs Hook** (`hooks/useLocationPods`) — fetches, decrypts, submits, and revokes location PODs. Handles TLK initialization, wrapped TLK fetching, Network Node POD registration and refresh. Caches wallet auth headers.
- **TLK Status Hook** (`hooks/useTlkStatus`) — checks TLK initialization state for a tribe.
- **TLK Distribution Hook** (`hooks/useTlkDistribution`) — manages wrapping TLK for pending tribe members.
- **ZK Filter Hook** (`hooks/useZkLocationFilter`) — generates and submits region/proximity/mutual proximity proofs for PODs, queries verified results. Supports named region/constellation proof by ID, and mutual proximity proofs between two decrypted PODs for witnessed contract fulfillment. Deduplicates Network Node derived PODs.
- **Region Data** (`lib/regions.ts`, `lib/solarSystems.ts`) — client-side region/constellation/solar system reference data with bounding boxes.
- **Locations Page** (`pages/LocationsPage`) — TLK status banner, decrypted POD listing grouped by solar system, register/revoke actions, pending member key distribution. "Prove Proximity" action launches mutual proximity proof modal.
- **POD Proof Modal** (`components/locations/PodProofModal`) — review and copy a shareable proof bundle for an owned POD. Displays public attestation fields (location hash, wallet signature, versions), associated ZK proofs, and location tags. Supports details and raw JSON views with copy-to-clipboard.
- **Mutual Proximity Proof Modal** (`components/locations/MutualProximityProofModal`) — select two decrypted PODs and a distance threshold, generate a Groth16 mutual proximity proof in-browser, and submit to the indexer. Shows actual distance, confirmation step, and success state. Used for fulfilling proximity-gated witnessed contracts.

### Forge Planner

- **Forge Planner Page** (`pages/ForgePlanner`) — three-tab interface: Blueprints (browse game blueprints), Planner (optimizer + build queue), Orders (active multi-input contracts with create/detail modals).
- **Blueprints Hook** (`hooks/useBlueprints`) — loads blueprint data from `/blueprints.json`, converts to `RecipeData[]` for the optimizer.
- **Optimizer Hook** (`hooks/useOptimizer`) — browser-side recipe tree resolution and gap analysis. Resolves a target item + quantity to a full dependency tree, collects leaf materials, and compares against inventory for a shopping list.
- **BOM Library** (`lib/bom.ts`) — Bill of Materials expansion at configurable depth (0 = finished items, 1 = direct inputs, ∞ = raw materials). Used by both optimizer UI and multi-input contract creation to generate slot lists.

### SSU Delivery dApp

- **SsuDeliveryDapp** (`pages/SsuDeliveryDapp`) — lightweight SSU-specific dApp for contract fulfillment. Fetches SSU metadata and inventory, filters contracts for deliverable items from the user’s player inventory, and provides a delivery modal. Rendered under `/dapp/ssu/:ssuId`.

### Page Routes

- `/` — Dashboard (overview with quick actions for contract creation)
- `/tribes` — Tribe list
- `/tribe/:tribeId` — Tribe detail (members, reputation leaderboard)
- `/contracts` — Trustless contracts list
- `/contracts/create` — Create new contract
- `/contracts/:contractId` — Contract detail (fills, status)
- `/continuity` — Continuity Engine (puzzle-service iframe with CormState bridge)
- `/events` — Event Explorer (filterable event log)
- `/structures` → redirects to `/structures/:characterId`
- `/structures/:characterId` — Player's structures
- `/locations` — Shadow Location Network (TLK management, encrypted PODs, ZK proof generation)
- `/notifications` — Notification history
- `/settings` — App settings
- `/dapp/ssu/:ssuId` — SSU Delivery dApp (lightweight, no sidebar/header)
- `/dapp/*` — Lightweight dApp shell for in-game SSU embedding

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
- `VITE_CORM_CONFIG_ID` — CormConfig shared object ID (for permissionless corm installation)

Per-environment defaults are defined in `config.ts` and overridden by explicit `VITE_*` vars. Environment files: `.env.localnet`, `.env.utopia`, `.env.stillness`.

## Deployment

- **Local:** `npm run dev` via `mprocs.yaml` (Vite dev server on :5173, proxies `/api` → indexer)
- **Production:** Static build deployed to S3 behind CloudFront
  - Build: `npm run build -- --mode utopia|stillness`
  - Deploy: `make deploy-frontend ENV=utopia|stillness` (S3 sync + CloudFront invalidation)
  - SPA routing: CloudFront 404 → `/index.html`

## Features

- Wallet-connected SPA with Eve Frontier Character identity resolution
- Tribe management: creation, self-join (auto-detected), member management, leadership transfer
- Trustless contract creation and filling for all 6 contract types (coin-for-coin, coin-for-item, item-for-coin, item-for-item, multi-input, transport)
- Contract visibility filtering (character and tribe access control)
- Dashboard with configurable quick actions (persisted to localStorage)
- Forge Planner with blueprint browser, recipe tree optimizer, gap analysis, and multi-input order management
- Bill of Materials expansion at configurable depth for contract slot generation
- Continuity Engine with on-chain CormState bridge
- Shadow Location Network: encrypted POD management, TLK lifecycle (init/wrap/rotate), signature-derived X25519 keypairs, Poseidon hash commitments
- Browser-side ZK proof generation (Groth16/snarkjs) for region, proximity, and mutual proximity location filters
- POD proof review and copy: owners can review and export a shareable proof bundle (public attestation + ZK proofs + location tags) for external applications
- Named region/constellation proof with canonical bounding box validation
- Mutual proximity proof modal for two-structure distance attestation (witnessed contract fulfillment)
- Contract detail page proximity requirement display with link to proof generation
- SSU Delivery dApp for in-game contract fulfillment
- Payout and item pickup notification watcher
- Auto-join tribe detection and one-click self_join
- Initialize tribe banner for unclaimed in-game tribes
- Install Corm: dashboard card for installing a corm on a player-owned Network Node (permissionless on-chain `corm_state::install`)
- Event Explorer with type/tribe/character filtering and pagination
- Structure browser with aggregated SSU inventory
- Assembly metadata: user-defined structure names via on-chain MetadataRegistry, inline edit UI, indexer-backed batch reads
- Structure rows use a two-zone flex layout: left-aligned info tags (type, status, energy) with fixed min-widths for vertical alignment, and right-aligned action items (location, extension, online/offline buttons) pushed to the trailing edge. Same pattern applied to NetworkNodeGroup headers.
- Tribe member list includes a "Structures" column linking to each member's structures page (`/structures/:characterId`) for easy cross-member structure browsing
- Location badge deep-linking: the "📍 Location" badge on structure rows and network node headers links to `/locations?structure=<id>`, scrolling to and briefly highlighting the matching POD row on the Locations page
- Structures → Locations navigation: structure rows and network node group headers without a registered location show a "+ Location" link to `/locations`, enabling the player to navigate directly to the Locations page to unlock the TLK and register locations

## Open Questions / Future Work

- Offline-capable PWA for mobile access
- Real-time event streaming (WebSocket from indexer) instead of polling
- Forge Planner: multi-recipe selection for optimizer, batch order creation
