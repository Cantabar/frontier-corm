# Phase 1 Execution Notes — Tribe Registry

**Dates**: March 11, 2026 (Days 1–4 of hackathon)
**Status**: Complete — 10/10 tests passing, committed to `main`

---

## What was built

`contracts/tribe/` — a fully on-chain Tribe Registry for EVE Frontier on Sui.

### Objects

| Object | Type | Purpose |
|--------|------|---------|
| `Tribe<phantom C>` | Shared | Authoritative registry for a single tribe |
| `TribeCap` | Owned (key, store) | Proves membership + role; authenticates all tribe operations |
| `RepUpdateCap` | Owned (key, store) | Delegatable authority for automated reputation updates |
| `TreasuryProposal` | Shared | On-chain spend proposal open for member voting |

### `Tribe<C>` fields

- `name: String`
- `leader_character_id: ID`
- `members: Table<ID, Role>` — Character object ID → Role (Leader/Officer/Member)
- `reputation: Table<ID, u64>` — per-tribe score, independent per tribe
- `treasury: Balance<C>` — generic fungible token balance
- `vote_threshold: u64` — 1–100 (percentage of members required to pass a spend)
- `member_count: u64`

### Entry points

- `create_tribe<C>(character, name, vote_threshold, ctx) → TribeCap`
- `add_member<C>(tribe, cap, new_member_character, role, ctx) → TribeCap`
- `remove_member<C>(tribe, cap, character_id)`
- `update_reputation<C>(tribe, cap, character_id, delta, increase)`
- `issue_rep_update_cap<C>(tribe, cap, ctx) → RepUpdateCap`
- `update_reputation_with_cap<C>(tribe, rep_cap, character_id, delta, increase)`
- `deposit_to_treasury<C>(tribe, coin)`
- `propose_treasury_spend<C>(tribe, cap, amount, recipient, deadline_ms, clock, ctx)`
- `vote_on_proposal<C>(tribe, proposal, cap, clock)`
- `execute_proposal<C>(tribe, proposal, clock, ctx)`

### Test coverage (10 tests)

- `create_tribe_success` — tribe created, shared, cap role correct
- `create_tribe_empty_name_fails` — abort ETribeNameEmpty (0)
- `add_member_success` — member count, membership, cap role
- `add_member_as_member_fails` — abort ENotAuthorized (1) when non-officer tries
- `remove_member_success` — count and membership checks after removal
- `update_reputation_success` — increase, decrease, clamped-to-zero decrease
- `rep_update_cap_success` — RepUpdateCap issued and used cross-module style
- `treasury_deposit_and_vote_execute` — full flow: deposit → propose → 2 votes → execute
- `execute_proposal_without_enough_votes_fails` — abort EThresholdNotMet (8)
- `double_vote_fails` — abort EAlreadyVoted (7)

---

## Key technical decisions

### 1. `Tribe<phantom C>` instead of `Tribe` with `Balance<EVE>`

**Problem**: The `assets` package (which provides the `EVE` coin type) uses the old-style
Move.toml format (`[addresses]` section + explicit Sui git dependency). The `world` package
uses new-style (environment-based, no `[addresses]`). Old-style and new-style packages
cannot be mixed in the same dependency graph.

**Decision**: Make the treasury generic with a phantom coin type parameter.
Deploy on EVE Frontier testnet as `Tribe<assets::EVE::EVE>`. Unit tests use a local
`TESTCOIN` witness struct so no dependency on the `assets` package is needed at all.

**Benefit**: Also makes the contract more reusable and avoids coupling to a single token.

### 2. `Role` constructors exposed as public functions

**Problem**: In Move 2024.beta, enum variants of a `public enum` cannot be directly
constructed from outside their defining module (compiler error E04001).
This would prevent callers from passing `Role::Member` to `add_member`.

**Decision**: Add explicit constructor functions in `tribe.move`:
```move
public fun role_leader(): Role { Role::Leader }
public fun role_officer(): Role { Role::Officer }
public fun role_member(): Role { Role::Member }
```

### 3. `u64` error constants instead of `#[error(code = N)] vector<u8>`

**Problem**: The Move 2024 `#[error(code = N)]` attribute creates `vector<u8>` constants.
When used in `assert!`, the VM aborts via a string-based mechanism, not a numeric one.
`#[expected_failure(abort_code = N)]` in tests expects a numeric `u64` abort — the two
mechanisms do not match, causing every expected-failure test to fail at runtime.

**Decision**: Use plain `u64` error constants (the conventional Sui Move pattern):
```move
const ETribeNameEmpty: u64 = 0;
const ENotAuthorized:  u64 = 1;
// ...
```
This sacrifices in-transaction string error messages but keeps tests deterministic and
integrates cleanly with `sui move test`.

### 4. Scoped borrow blocks in reputation update functions

**Problem**: The borrow checker rejected `object::id(tribe)` after
`tribe.reputation.borrow_mut(character_id)` — the mutable field borrow keeps `tribe`
mutably borrowed, so freezing it (via `object::id`) is forbidden.

**Decision**: Capture `tribe_id = object::id(tribe)` before the borrow, and wrap the
mutation in a block to explicitly end the borrow before the `event::emit` call:
```move
let tribe_id = object::id(tribe);
let new_score = {
    let score = tribe.reputation.borrow_mut(character_id);
    *score = /* ... */;
    *score
};
event::emit(ReputationUpdatedEvent { tribe_id, character_id, new_score });
```

### 5. `move.toml` new-style (no `[addresses]`, no `[environments]`)

The `tribe` package follows the new-style Move.toml format used by `world` and
`extension_examples`. This avoids the `active environment not present in Move.toml`
error that blocked old-style packages. The package has a single dependency on `world`.

---

## Files created

```
contracts/tribe/
  Move.toml
  Move.lock                        (generated)
  sources/tribe.move
  tests/tribe_tests.move

contracts/contract_board/          Phase 2 placeholder
  Move.toml
  sources/contract_board.move

contracts/forge_planner/           Phase 3 placeholder
  Move.toml
  sources/forge_planner.move

indexer/README.md                  Phase 4 placeholder
app/README.md                      Phase 4/5 placeholder
circuits/README.md                 Phase 4 zk placeholder
```

---

## Phase 2 integration notes

The `RepUpdateCap` capability pattern was designed specifically for the Contract Board
(Phase 2). The flow will be:

1. Tribe leader calls `issue_rep_update_cap` and transfers the cap to the
   Contract Board's hot wallet or module.
2. On job completion, the Contract Board calls `update_reputation_with_cap` to
   increment the worker's tribe reputation automatically.
3. No live operator needed for the reputation update — fully trustless.

The `TribeCap.tribe_id` field allows the Contract Board to verify job participants
are genuine tribe members without any cross-module state query.
