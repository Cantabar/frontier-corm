# Sponsored Transactions: Cleanup Rebate → Creation Subsidy Flywheel

## Problem

The cleanup worker already reclaims SUI storage rebates when deleting completed contract objects (tracked in `cleanup_jobs` with `net_rebate_mist`). These rebates accumulate in the service wallet but currently just sit there. Meanwhile, users must pay gas for every contract creation, which is friction.

Goal: route cleanup rebates into a **gas station** that sponsors contract creation (and optionally fill) transactions, creating a self-sustaining lifecycle:

`create → fill → complete → cleanup (reclaim rebate) → sponsor next create`

## Current State

- **Move contracts**: `cleanup_completed_contract` / `cleanup_completed_item_contract` delete shared objects, returning storage rebates to the transaction sender (the cleanup service wallet). No contract changes needed — sponsorship is a SUI protocol feature, transparent to Move.
- **Cleanup worker** (`indexer/src/cleanup/cleanup-worker.ts`): Ed25519 service wallet that builds+signs+executes cleanup PTBs. Tracks `storage_rebate_mist`, `computation_cost_mist`, `net_rebate_mist` per job in Postgres.
- **Web UI PTB builders** (`web/src/lib/sui.ts`): All creation builders (`buildCreateCoinForCoin`, etc.) currently use `tx.splitCoins(tx.gas, ...)` for escrow, meaning the user's wallet is always the gas payer.
- **SUI SDK support**: `Transaction.fromKind(kindBytes)` + `setSender()` + `setGasOwner()` + `setGasPayment()` is the standard sponsored transaction pattern. The user builds a transaction kind, the sponsor wraps it with gas data and signs, the user counter-signs, and the dual-signed tx is submitted.

## Proposed Architecture

### 1. Gas Station API (new module in indexer)

New route on the existing indexer Express server.

**Endpoint**: `POST /api/v1/sponsor`

**Request body**: `{ txKindBytes: string (base64), sender: string }`

**Flow**:
1. Decode and deserialize the `TransactionKind`
2. Validate: only sponsor allowed transaction types (contract creation and fill functions from our packages)
3. Check budget: per-sender daily limit, global daily limit, minimum sponsor wallet balance
4. Reconstruct a `Transaction` from the kind bytes via `Transaction.fromKind()`
5. Set `sender` to the user address, `gasOwner` to the sponsor wallet address
6. Select gas coins from the sponsor wallet
7. Sign with the sponsor's Ed25519 keypair
8. Return: `{ txBytes: string (base64), sponsorSignature: string (base64) }`

**Validation whitelist** (only sponsor these Move targets):
- `trustless_contracts::create_coin_for_coin`
- `trustless_contracts::create_coin_for_item`
- `trustless_contracts::create_item_for_coin`
- `trustless_contracts::create_item_for_item`
- `trustless_contracts::create_transport`
- `multi_input_contract::create`
- Optionally: fill functions (lower priority — fillers are already incentivized by payouts)

**Budget controls**:
- `SPONSOR_MAX_GAS_BUDGET`: max gas per sponsored tx (e.g. 5M MIST)
- `SPONSOR_DAILY_LIMIT_PER_SENDER`: max gas sponsored per sender address per day
- `SPONSOR_DAILY_GLOBAL_LIMIT`: total gas budget across all sponsored txs per day
- `SPONSOR_MIN_BALANCE`: refuse sponsorship if sponsor wallet balance drops below this threshold

### 2. Cleanup Worker Enhancement

Minor changes to the existing worker:
- The service wallet already receives storage rebates from cleanup txs, so the SUI balance naturally accumulates for sponsorship.
- Add a periodic balance check log: `[cleanup] Sponsor wallet balance: X SUI`
- Optionally split the wallet if accounting isolation is desired, but for hackathon scope a single wallet is simpler — the cleanup worker and gas station share the same keypair.

### 3. Web Frontend Changes

New utility in `web/src/lib/sui.ts` and integration into creation flows.

**New function**: `sponsorTransaction(tx: Transaction, sender: string): Promise<{ txBytes, sponsorSignature }>`
- Builds the transaction with `onlyTransactionKind: true` to get kind bytes
- POSTs to `{config.indexerUrl}/sponsor` with the kind bytes + sender
- Returns the sponsored tx bytes and sponsor signature

**Modified creation hooks/components**:
- In `CreateContractModal`, `CreateMultiInputContractModal`, etc.:
    1. Build the creation PTB as today
    2. Attempt `sponsorTransaction()` — if successful, use the dapp-kit `signTransaction` (user signs the sponsored bytes), then `executeTransactionBlock` with both signatures
    3. If sponsorship fails (budget exceeded, service unavailable), fall back to the current `signAndExecuteTransaction` flow (user pays gas)
- Add a UI indicator: "Gas sponsored by Corm" or "Sponsored ✓" badge when a transaction is sponsored

### 4. Database Schema Addition

New table `sponsored_transactions` for audit trail and budget enforcement:
- `id SERIAL PRIMARY KEY`
- `sender TEXT NOT NULL` — user wallet address
- `tx_digest TEXT` — on-chain transaction digest
- `tx_type TEXT NOT NULL` — e.g. 'create_coin_for_coin'
- `gas_budget_mist BIGINT NOT NULL`
- `actual_gas_mist BIGINT` — filled after execution
- `status TEXT DEFAULT 'pending'` — pending / confirmed / failed
- `created_at TIMESTAMPTZ DEFAULT NOW()`

This table enables the daily budget queries: `SELECT SUM(gas_budget_mist) FROM sponsored_transactions WHERE sender = $1 AND created_at > NOW() - '1 day'`.

### 5. API endpoint for stats

Extend `GET /api/v1/cleanup/stats` to include sponsorship stats:
- Total SUI reclaimed from cleanups
- Total SUI spent on sponsorship
- Net balance (reclaimed - sponsored)
- Current sponsor wallet on-chain balance

This gives a dashboard view of the flywheel economics.

## Implementation Order

1. **Database**: Add `sponsored_transactions` table migration
2. **Gas station API**: New `indexer/src/sponsor/` module with route, validation, budget checks
3. **Web client**: `sponsorTransaction()` helper + integrate into creation modals with fallback
4. **Stats**: Extend cleanup stats endpoint with sponsorship data
5. **Testing**: End-to-end on localnet: create sponsored → fill → complete → cleanup → verify rebate → create another sponsored

## Key SUI-Specific Details

- **Dual signatures**: The sponsored tx needs both the user signature (over the full `TransactionData`) and the sponsor signature. The user signs first via dapp-kit's `signTransaction`, then we combine both signatures for execution.
- **Gas coin selection**: The sponsor API must call `suiClient.getCoins()` to select gas coins owned by the sponsor wallet. A single SUI coin works if balance is sufficient.
- **Storage rebate flow**: When a shared object is deleted, the storage rebate goes to the gas payer of that transaction. Since the cleanup worker's service wallet pays gas, rebates accumulate there — exactly where the gas station needs them.
- **No Move changes required**: Sponsored transactions are transparent to the Move runtime. The `ctx.sender()` still returns the user's address, not the sponsor's.

## Hackathon Showcase Value

This directly demonstrates SUI's sponsored transaction primitive in a real economic loop:
- Contract objects consume storage → storage deposit paid at creation
- Cleanup reclaims storage → rebate returned to service wallet
- Service wallet sponsors next creation → reduces user friction
- Net effect: the system partially self-funds, and users see zero-gas contract creation

This is a strong SUI differentiator vs EVM chains where gas sponsorship requires separate relay networks (GSN, meta-transactions, etc.).
