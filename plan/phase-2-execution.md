# Phase 2 Execution Notes — Contract Board

**Dates**: March 11, 2026 (Days 5–10 of hackathon)
**Status**: Complete — 12/12 tests passing

---

## What was built

`contracts/contract_board/` — an on-chain job board with escrow, completion verification types, and tribe reputation integration.

### Objects

| Object | Type | Purpose |
|--------|------|---------|
| `JobPosting<phantom C>` | Shared | Active contract with escrowed tokens, deleted on terminal state |

### `JobPosting<C>` fields

- `poster_id: ID` — Character ID of the poster
- `poster_address: address` — wallet address for escrow return
- `poster_tribe_id: ID` — tribe context for reputation
- `description: String`
- `completion_type: CompletionType` — Delivery / Bounty / Transport / Custom
- `reward_amount: u64` — original escrow amount
- `escrow: Balance<C>` — locked tokens (generic coin type)
- `assignee_id: Option<ID>` — Character ID of accepted worker
- `assignee_address: Option<address>` — wallet address for escrow release
- `deadline_ms: u64` — timestamp after which job can be expired
- `status: JobStatus` — Open / Assigned / Disputed
- `min_reputation: u64` — minimum tribe rep required to accept

### Enums

- `CompletionType` — Delivery (storage_unit_id, type_id, quantity), Bounty (target_character_id), Transport (gate_id), Custom (commitment_hash)
- `JobStatus` — Open, Assigned, Disputed

### Entry points

- `create_job<C>(tribe, cap, character, description, completion_type, escrow_coin, deadline, min_rep, clock, ctx)` — poster locks escrow, job shared
- `accept_job<C>(job, tribe, cap, character, clock)` — assignee meets rep requirement, status → Assigned
- `confirm_completion<C>(job, cap, ctx)` — poster confirms, escrow → assignee, job deleted
- `confirm_completion_with_rep<C>(job, tribe, rep_cap, cap, rep_delta, ctx)` — same + reputation award via RepUpdateCap
- `cancel_job<C>(job, cap, ctx)` — poster cancels open job, escrow returned
- `expire_job<C>(job, clock, ctx)` — anyone calls after deadline, escrow → poster, job deleted

### Events

- `JobCreatedEvent` — job_id, poster_id, poster_tribe_id, completion_type, reward_amount, deadline_ms, min_reputation
- `JobAcceptedEvent` — job_id, assignee_id
- `JobCompletedEvent` — job_id, poster_id, assignee_id, reward_amount, completion_type, rep_awarded
- `JobExpiredEvent` — job_id, poster_id, reward_amount
- `JobCancelledEvent` — job_id, poster_id, reward_amount

### Test coverage (12 tests)

- `create_job_success` — job created, shared, correct fields
- `create_job_empty_description_fails` — abort EDescriptionEmpty (0)
- `create_job_zero_escrow_fails` — abort EInsufficientEscrow (6)
- `accept_job_success` — assignee set, status Assigned
- `accept_job_self_assign_fails` — abort ESelfAssign (10)
- `accept_job_low_reputation_fails` — abort EReputationTooLow (7) when member has rep=0 but job requires 100
- `confirm_completion_success` — full flow: create → accept → complete, escrow transferred
- `confirm_completion_with_rep_success` — same + RepUpdateCap awards reputation to assignee
- `cancel_job_success` — poster cancels open job, escrow returned
- `cancel_assigned_job_fails` — abort EJobNotOpen (1) when trying to cancel assigned job
- `expire_job_success` — anyone triggers expiry after deadline, escrow → poster
- `expire_before_deadline_fails` — abort EJobNotExpired (4)

---

## Key technical decisions

### 1. Poster-confirmed completion (hackathon scope)

**Problem**: The plan describes on-chain verification via world contract events/objects
(ItemDepositedEvent, KillmailCreatedEvent, JumpEvent). However, these events can't be
read on-chain from other modules, and the world contract objects (Killmail, Inventory)
lack public getter functions accessible from external packages.

**Decision**: Completion is poster-confirmed for the hackathon. The `CompletionType` enum
captures the *intent* of what verification is expected (Delivery, Bounty, Transport, Custom).
When world contracts expose public getters (or we add a thin verification layer), the
architecture supports plugging in automated on-chain verification without changing the
job lifecycle.

**Benefit**: Full escrow + reputation + event-sourcing system works now. Verification
is a separate concern that can be upgraded independently.

### 2. `JobPosting<phantom C>` — same generic pattern as `Tribe<C>`

**Decision**: Reuse the phantom coin type pattern from Phase 1. The escrow is held as
`Balance<C>` inside the job, not as a separate `JobEscrow` object.

**Benefit**: Simpler object lifecycle (one shared object per job, not two). Token-agnostic
deployment. If item escrow is needed later, a separate `ItemEscrow` wrapper can be added.

### 3. Stored `poster_address` and `assignee_address`

**Problem**: `expire_job` should be callable by anyone (prevent stale jobs), but the escrow
must go to the poster. `confirm_completion` needs to send escrow to the assignee.

**Decision**: Store `poster_address` at creation time and `assignee_address` at accept time.
Terminal functions don't need Character references — they use the stored addresses.

### 4. Cross-module reputation via `RepUpdateCap`

**Design**: `confirm_completion_with_rep` calls `tribe::update_reputation_with_cap` directly.
The caller provides both their TribeCap (poster identity) and a RepUpdateCap (tribe authority).
No cross-module state query needed — all authorization flows through capability objects.

### 5. Job deletion on terminal state

Jobs are consumed by value in `confirm_completion`, `cancel_job`, and `expire_job`.
The `JobPosting` struct is destructured, `Balance` is converted to `Coin` and transferred,
`UID` is deleted (reclaiming storage rebate). Only events remain as history.

---

## Files created

```
contracts/contract_board/
  Move.toml                           (unchanged from Phase 1 placeholder)
  sources/contract_board.move         (full implementation)
  tests/contract_board_tests.move     (12 tests)
```

---

## Phase 3 integration notes

The Forge Planner (Phase 3) will integrate with the Contract Board via **auto-generated
delivery jobs**. The flow will be:

1. Forge Planner resolves a recipe tree and identifies missing resources
2. For each missing resource, it calls `create_job` with `CompletionType::Delivery`
   specifying the target StorageUnit, type_id, and quantity
3. Workers accept and fulfill delivery jobs
4. On completion, `confirm_completion_with_rep` awards reputation and releases escrow

The `CompletionType::Delivery` variant already stores the exact fields needed:
`storage_unit_id`, `type_id`, and `quantity`. The Forge Planner just needs to
construct these from its recipe resolution output.

The `min_reputation` gate on jobs means that high-value manufacturing orders can
require trusted workers (high rep in the tribe) for critical resource deliveries.
