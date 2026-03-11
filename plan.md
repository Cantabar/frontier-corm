# Frontier Lattice — A Toolkit for Civilization

## EVE Frontier × Sui Hackathon 2026

**Theme:** "A Toolkit for Civilization"
**Timeline:** March 11–31, 2026 (~20 days)
**Approach:** Hybrid on-chain/off-chain with heavy Sui Move architecture

---

## Thesis

Civilization requires **division of labor**, and division of labor requires **trust infrastructure**. Frontier Lattice provides that trust layer on Sui

---

## Architecture Overview

```mermaid
graph TD
    subgraph "On-Chain (Sui Move)"
        ORG[Tribe Registry<br/>+ Per-Tribe Reputation]
        JB[Contract Board + Escrow<br/>Active Jobs Only]
        FP[Recipe Registry + Manufacturing Orders]
        ZK[zkProof Verifier]
    end

    subgraph "Off-Chain"
        AUTH[Auth Middleware<br/>Wallet Signature -> Session]
        OPT[Forge Optimizer<br/>Resource Gap Analysis]
        PRIV[Encrypted Storage<br/>Confidential Contract Details]
        IDX[Event Indexer<br/>Checkpoint Summaries + Hash Paths]
    end

    subgraph "EVE Frontier World Contracts"
        CHAR[Character]
        SSU[Smart Storage Unit]
        GATE[Smart Gate]
        KM[Killmail]
        EVE[EVE Token]
        AC[Access Control / OwnerCap]
    end

    ORG -->|membership checks| JB
    ORG -->|per-tribe rep gates| JB
    JB -->|auto-generate delivery jobs| FP
    JB -->|emit JobCompletedEvent| IDX
    JB -->|update tribe rep on completion| ORG
    ORG -->|shared treasury| JB
    ORG -->|tribe-wide goals| FP

    JB -->|escrow EVE tokens| EVE
    JB -->|verify delivery| SSU
    JB -->|verify kills| KM
    JB -->|verify transport| GATE
    JB -->|confidential verification| ZK

    FP -->|read inventory| SSU
    FP -->|resource reservation| SSU
    FP -->|emit ManufacturingCompleteEvent| IDX

    AUTH -->|verify wallet -> Character| CHAR
    AUTH -->|read on-chain roles| ORG
    OPT -->|read inventory state| SSU
    PRIV -->|commitment hashes| JB
    ZK -->|Groth16 verify| JB

    IDX -->|archive events + checkpoint proofs| IDX

    AC -->|OwnerCap pattern| ORG
    AC -->|OwnerCap pattern| JB
```

---

## Modules

### Phase 1 — Foundation (Days 1–4): Tribe Registry

**On-chain Move package.**

The auth primitive everything else depends on.

- `Tribe` shared object
  - name, leader (Character ID)
  - membership `Table<ID, Role>`
  - Roles: `Leader`, `Officer`, `Member`
  - `reputation: Table<ID, ReputationScore>` — per-tribe reputation for each Character
    - A player's standing is specific to each tribe they interact with
    - High rep in one tribe says nothing about standing in another
- `TribeCap` — capability issued to members, scoped to tribe functions
- Tribe-level shared treasury (holds EVE tokens via `assets/EVE.move`)
- On-chain voting for treasury spend (configurable threshold)

**Sui showcase:** Object model — each tribe is a first-class object with its own membership table, treasury, reputation, and governance. Per-tribe reputation avoids a global shared-object bottleneck. Composes naturally with the world contracts `OwnerCap` pattern.

**Key files in world-contracts:**
- `contracts/world/sources/access/access_control.move` — OwnerCap, AdminACL patterns
- `contracts/world/sources/character/character.move` — Character identity, tribe_id, character_address
- `contracts/extension_examples/sources/config.move` — ExtensionConfig + AdminCap + dynamic field pattern

---

### Phase 2 — Contract Board (Days 5–10): Job Board + Escrow

**On-chain Move package + off-chain encrypted storage.**

#### On-Chain

- `JobPosting` shared object — **only active jobs exist on-chain**
  - `poster_id` (Character ID)
  - `reward_type_id`, `reward_quantity`
  - `escrow` (EVE tokens locked on creation)
  - `completion_type` enum
  - `assignee` (optional Character ID)
  - `deadline` (timestamp)
  - `status` enum: `Open`, `Assigned`, `Disputed`
- `JobEscrow` — wraps EVE tokens or items, released on verified completion
- **On completion/expiry:** job emits `JobCompletedEvent` or `JobExpiredEvent`, updates poster tribe's reputation table for the assignee, releases escrow, then **deletes the JobPosting object** (reclaims storage rebate)
- Completed/expired job history lives exclusively in events, not on-chain objects

#### Completion Verification Types

Leveraging existing world contract events/objects:

| Type | On-Chain Verification |
|------|----------------------|
| **Delivery** | `ItemDepositedEvent` at specified StorageUnit — character deposited X quantity of type_id Y |
| **Bounty/Kill** | `KillmailCreatedEvent` matching target victim_id |
| **Transport** | `JumpEvent` for specific character through specified gate |
| **Custom/Confidential** | Groth16 zkProof (see below) |

#### Confidential Contracts (Mercenary Use Case)

- **On-chain:** stores only `commitment_hash = hash(target, reward, deadline, nonce)`
- **Off-chain:** encrypted contract details, shared only with accepted assignee
- **Completion:** assignee submits Groth16 zkProof proving:
  *"I know a killmail where victim matches the committed target and killer matches my character"*
  — without revealing the target publicly
- **Sui native:** `sui::groth16::verify_groth16_proof`

**Sui showcase:** Escrow via object ownership, event-driven verification, native zkProof verification, on-chain object lifecycle (create → use → delete with storage rebate), composability with world contract Killmail/Inventory/Gate events.

**Key files in world-contracts:**
- `contracts/world/sources/killmail/killmail.move` — KillmailCreatedEvent, victim_id, killer_id
- `contracts/world/sources/primitives/inventory.move` — ItemDepositedEvent, ItemWithdrawnEvent, type_id/quantity
- `contracts/world/sources/assemblies/gate.move` — JumpEvent, JumpPermit pattern
- `contracts/world/sources/assemblies/storage_unit.move` — extension-based deposit/withdraw
- `contracts/extension_examples/sources/corpse_gate_bounty.move` — reference for combining storage + gate extensions
- `contracts/assets/sources/EVE.move` — EVE token for escrow

---

### Phase 3 — Forge Planner (Days 11–16): Manufacturing Planner

**On-chain registry + off-chain optimization engine.**

#### On-Chain

- `RecipeRegistry` shared object
  - `Table<u64, Recipe>` mapping output `type_id` → input requirements `vector<{type_id, quantity}>`
  - Admin-managed (tribe leaders can propose recipes)
- `ManufacturingOrder` shared object — **only active orders exist on-chain**
  - Target item (`type_id`, `quantity`)
  - Required inputs (from recipe resolution)
  - Allocated resources / status
  - Linked tribe ID
- Resource reservation via StorageUnit extension pattern
  - Withdraw → hold in order escrow → deposit on completion or return on cancellation
- **On completion/cancellation:** emits `ManufacturingCompleteEvent` or `ManufacturingCancelledEvent`, then **deletes the order object**
- Order history lives exclusively in events

#### Off-Chain Optimizer

- Reads inventory state from StorageUnit on-chain (items by `type_id` and `quantity`)
- Given a build goal, recursively resolves the recipe tree
- Computes: what you have → what's missing → what needs to be gathered
- Outputs a shopping list / gathering plan
- **Auto-generates Delivery job postings** on the Contract Board for missing resources

**Sui showcase:** Dynamic fields for recipe storage, composability between ManufacturingOrder → JobPosting → StorageUnit.

**Key files in world-contracts:**
- `contracts/world/sources/primitives/inventory.move` — Inventory struct, ItemEntry (type_id, quantity, volume)
- `contracts/world/sources/assemblies/storage_unit.move` — inventory view functions, extension-based access

---

### Phase 4 — Event Indexer + Verifiable History (Days 17–18)

**Off-chain TypeScript service.**

All completed contracts, reputation changes, and manufacturing orders are recorded as on-chain events. The indexer captures these and archives them with cryptographic proofs for long-term verifiability.

#### Indexer Service

- Subscribes to Sui checkpoints via RPC / WebSocket
- Listens for Frontier Lattice events:
  - `JobCompletedEvent`, `JobExpiredEvent`, `JobDisputedEvent`
  - `ReputationUpdatedEvent` (emitted when tribe rep table changes)
  - `ManufacturingCompleteEvent`, `ManufacturingCancelledEvent`
  - `TribeMemberJoinedEvent`, `TribeMemberRemovedEvent`, `TreasurySpendEvent`
- For each event, archives:
  - The full event data
  - The **checkpoint summary** (digest, sequence number, epoch, validator signatures)
  - The **hash path** from event → transaction effects → checkpoint content digest (inclusion proof)
- Stores in Postgres (or SQLite for hackathon scope)
- Exposes a query API for the web app (event history, reputation audit trails)

#### Dispute Resolution

- If a tribe's on-chain reputation for a player is challenged, the indexer can produce the full event trail with checkpoint inclusion proofs
- Any third party with knowledge of the validator set for that epoch can independently verify the proofs
- Events are the authoritative source of truth; on-chain reputation scores are a materialized cache

**Sui showcase:** Demonstrates the event-sourcing pattern — on-chain objects as live state, events as provable history. Checkpoint inclusion proofs provide trust without requiring archival nodes.

---

### Phase 5 — Integration Polish (Days 19–20)

#### Cross-Module Integration

- Tribe → Job Board: only tribe members can post from tribe treasury
- Job Board → Forge Planner: missing resources auto-generate delivery contracts
- Job Board → Tribe Reputation: completed jobs update the posting tribe's rep table for the assignee
- Tribe Reputation → Job Board: high-value contracts require minimum rep within that tribe
- Tribe → Forge Planner: tribe-wide manufacturing goals using shared inventory

#### Object Lifecycle Cleanup

- Completed/expired jobs and manufacturing orders are deleted after emitting events (storage rebate)
- Only active, in-progress objects remain on-chain at any time
- Indexer provides historical query capability for the web app

---

## Privacy Architecture

```mermaid
sequenceDiagram
    participant Poster as Job Poster
    participant Chain as Sui On-Chain
    participant Store as Encrypted Storage
    participant Merc as Mercenary (Assignee)
    participant ZK as zkProof Verifier

    Poster->>Store: Encrypt contract details (target, terms)
    Poster->>Chain: Post job with commitment_hash only
    Merc->>Chain: Accept job (escrow locked)
    Poster->>Merc: Share decryption key (off-chain)
    Merc->>Store: Decrypt and read contract details
    Note over Merc: Completes the contract in-game
    Merc->>ZK: Generate Groth16 proof (killmail matches commitment)
    Merc->>Chain: Submit proof for verification
    Chain->>Chain: sui::groth16::verify_groth16_proof
    Chain->>Merc: Release escrow on valid proof
```

- **On-chain:** commitment hashes only (content hash + nonce)
- **Off-chain:** AES-encrypted blobs (IPFS or lightweight backend)
- **Key exchange:** between parties using wallet-derived keys
- **Verification:** Groth16 proofs verified natively on Sui

---

## Design Principles

- **Objects as live state, events as history.** On-chain objects represent only pending/active state. Completed work is recorded in events and deleted from on-chain storage (reclaiming rebates).
- **Per-tribe reputation, not global.** Each tribe maintains its own reputation table. A player's standing is contextual to each tribe relationship.
- **Verifiable off-chain history.** The event indexer archives events with checkpoint inclusion proofs, providing cryptographic verifiability without requiring archival nodes.
- **Minimize shared object contention.** Favor owned objects and per-entity sharding over global registries to preserve Sui's parallel execution advantage.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Sui Move |
| zkProofs | Groth16 via `sui::groth16` |
| Off-chain Auth | Wallet signature verification → session tokens |
| Event Indexer | TypeScript + Postgres (archives events with checkpoint proofs) |
| External Tools | TypeScript/React web app |
| Data Layer | Sui RPC for on-chain reads, indexer for historical queries, encrypted off-chain storage |
| World Integration | EVE Frontier World Contracts (typed witness extension pattern) |

---

## Hackathon Category Targets

| Category | Alignment |
|----------|-----------|
| **Utility** | Manufacturing planner + job board directly change how players coordinate and survive |
| **Technical Implementation** | Heavy Sui usage: Move packages, escrow, zkProofs, composable extensions |
| **Creative** | Connected "G-Suite" concept with privacy layer is novel for Frontier |
| **Live Frontier Integration** | Tribe system + job board deployable to Stillness for real player testing |

---

## Submission Deliverables

- [ ] Demo video (max 6 minutes)
- [ ] 200-word description
- [ ] Git repository with source code
- [ ] Supporting documentation / architecture diagrams
- [ ] (Stretch) Live deployment to Stillness

---

## Repository Structure (Planned)

```
hackathon/
├── plan.md                          # This file
├── world-contracts/                 # Reference: EVE Frontier world contracts (cloned)
├── contracts/                       # Our Sui Move packages
│   ├── tribe/                # Phase 1: Tribe registry + treasury + voting
│   │   ├── Move.toml
│   │   ├── sources/
│   │   └── tests/
│   ├── contract_board/              # Phase 2: Job board + escrow + verification
│   │   ├── Move.toml
│   │   ├── sources/
│   │   └── tests/
│   ├── forge_planner/               # Phase 3: Recipe registry + manufacturing orders
│   │   ├── Move.toml
│   │   ├── sources/
│   │   └── tests/
├── indexer/                         # Phase 4: Event indexer + verifiable history
│   ├── src/
│   │   ├── subscriber/              # Checkpoint subscription + event filtering
│   │   ├── archiver/                # Store events + checkpoint summaries + inclusion proofs
│   │   ├── api/                     # Query API for historical events + reputation audit
│   │   └── db/                      # Postgres/SQLite schema + migrations
│   ├── package.json
│   └── tsconfig.json
├── app/                             # Off-chain web application
│   ├── src/
│   │   ├── auth/                    # Wallet signature auth middleware
│   │   ├── optimizer/               # Manufacturing planner optimizer
│   │   ├── privacy/                 # Encrypted storage + key exchange
│   │   └── ui/                      # Dashboard / planning interface
│   └── package.json
├── circuits/                        # zkProof circuits (Groth16)
│   └── confidential_contract/
└── scripts/                         # Deployment and testing scripts
```
