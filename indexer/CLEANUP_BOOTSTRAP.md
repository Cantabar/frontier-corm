# Cleanup Worker — Bootstrap Plan

## Prerequisites
- SUI CLI installed (`sui` binary on PATH)
- Indexer running with events being archived (ContractCompletedEvent / MultiInputContractCompletedEvent)
- Postgres running and accessible (local: `docker compose up -d postgres`)
- The `multi_input_contract` package redeployed with the new `cleanup` function

## 1. Generate a Service Keypair

```bash
sui keytool generate ed25519
```

This prints three values:
- **address** — the SUI address of the new keypair
- **keyScheme** — `ed25519`
- **privateKey** — base64-encoded private key (flag byte + 32 secret bytes)

Copy the `privateKey` value; you'll need it in step 3.

## 2. Fund the Service Wallet

The cleanup worker pays gas for each cleanup transaction. Storage rebates flow
back to this address, making it roughly self-sustaining — but it needs an
initial balance.

### Local network
```bash
sui client faucet --address <SERVICE_ADDRESS>
```

### Testnet / Devnet
Use the faucet at https://faucet.devnet.sui.io/ (devnet) or request testnet
tokens via Discord.

### Mainnet
Transfer SUI to the service address from an existing wallet. A few SUI should
last a very long time (each cleanup costs ~0.003–0.005 SUI, and rebates
typically exceed the gas cost).

## 3. Configure Environment Variables

Add the following to your `.env` file (or set them directly in docker-compose):

```bash
# Enable the cleanup worker
CLEANUP_ENABLED=true

# Base64 private key from step 1
CLEANUP_WORKER_PRIVATE_KEY=<base64-encoded-private-key>

# Optional tuning (defaults shown)
CLEANUP_DELAY_MS=30000        # Wait 30s after completion before cleanup
CLEANUP_INTERVAL_MS=15000     # Poll for pending jobs every 15s
CLEANUP_MAX_RETRIES=3         # Retry failed jobs up to 3 times
CLEANUP_GAS_BUDGET=5000000    # 5M MIST (0.005 SUI) per cleanup tx

# Coin types (only needed if not using default SUI)
# CLEANUP_COIN_TYPE=0x2::sui::SUI
# CLEANUP_FILL_COIN_TYPE=0x2::sui::SUI
```

## 4. Run the Database Migration

The new `cleanup_jobs` table is created automatically when the indexer starts
(via the `initDatabase` schema migration). If you need to run it manually:

```bash
npx tsx src/db/schema.ts
```

## 5. Start the Indexer

### Local dev (docker-compose)
```bash
# From the project root
make local
```

### Local dev (direct)
```bash
# From the indexer directory
npm run dev
```

### Production (Docker)
The indexer container reads from `.env` via `env_file` in docker-compose.
Ensure the env vars from step 3 are set before starting.

## 6. Verify the Worker is Running

Check the indexer logs for:
```
[cleanup] Starting cleanup worker (interval=15000ms, delay=30000ms, address=0x...)
```

If the private key is missing or invalid:
```
[cleanup] CLEANUP_ENABLED=true but no CLEANUP_WORKER_PRIVATE_KEY set — cleanup worker not started.
```

## 7. Monitor Cleanup Jobs

### Via API
```bash
# Stats: job counts by status, total SUI reclaimed
curl http://localhost:3100/api/v1/cleanup/stats

# Job list with rebate details
curl http://localhost:3100/api/v1/cleanup/jobs
```

### Via Postgres
```sql
-- Job overview
SELECT status, COUNT(*), SUM(net_rebate_mist) as total_net_rebate
FROM cleanup_jobs GROUP BY status;

-- Recent confirmed cleanups
SELECT contract_id, storage_rebate_mist, computation_cost_mist, net_rebate_mist, cleanup_tx_digest
FROM cleanup_jobs WHERE status = 'confirmed' ORDER BY updated_at DESC LIMIT 10;

-- Failed jobs (need investigation)
SELECT contract_id, contract_type, error_message, retry_count
FROM cleanup_jobs WHERE status = 'failed';
```

## 8. Verify Service Wallet Balance

Periodically check that the service wallet has sufficient gas:

```bash
sui client gas --address <SERVICE_ADDRESS>
```

Under normal operation the wallet is self-sustaining: each cleanup deletes a
shared object whose storage rebate exceeds the gas cost. If the balance drops
unexpectedly, check for repeated failures (which consume gas without rebates).

## Troubleshooting

**"Object not found" for all jobs** — The contracts may have already been
cleaned up manually via the web UI. These are marked `not_found` and are
harmless.

**Repeated failures on item contracts** — `cleanup_completed_item_contract`
requires the poster's Character object and source SSU to be accessible. If the
`ContractCreatedEvent` was not indexed (e.g., indexer started after the
contract was created), the worker won't have the metadata it needs. Check the
`error_message` column.

**Insufficient gas** — Fund the service wallet. On local networks use
`sui client faucet`.

**Wrong coin type** — If your deployment uses a custom coin type (not
`0x2::sui::SUI`), set `CLEANUP_COIN_TYPE` and `CLEANUP_FILL_COIN_TYPE`.
