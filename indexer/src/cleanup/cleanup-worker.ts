/**
 * Cleanup Worker — background service that garbage-collects completed
 * contract objects on Sui, reclaiming storage rebates.
 *
 * Lifecycle:
 *   1. Enqueue: scan archived CompletedEvents → insert pending cleanup_jobs
 *   2. Process: for each pending job past the delay window:
 *      a. Verify the object still exists on-chain
 *      b. Build + sign + execute the cleanup PTB
 *      c. Record storage rebate from transaction effects
 *
 * Runs on a configurable timer alongside the indexer in the same process.
 */

import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Transaction } from "@mysten/sui/transactions";
import type pg from "pg";
import type { IndexerConfig } from "../types.js";
import {
  getExistingCleanupContractIds,
  getPendingCleanupJobs,
  insertCleanupJob,
  markCleanupConfirmed,
  markCleanupFailed,
  markCleanupNotFound,
} from "../db/queries.js";
import {
  buildCleanupCompletedContract,
  buildCleanupCompletedItemContract,
  buildCleanupMultiInputContract,
  isItemContract,
} from "./cleanup-transactions.js";

export class CleanupWorker {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private config: IndexerConfig;
  private pool: pg.Pool;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private jobsProcessed = 0;

  constructor(config: IndexerConfig, pool: pg.Pool) {
    this.config = config;
    this.pool = pool;
    this.client = new SuiClient({ url: config.suiRpcUrl });

    // Decode the private key from base64 (Sui keystore format: flag byte + 32 bytes)
    const keyBytes = Buffer.from(config.cleanup.privateKey, "base64");
    // If 33 bytes, first byte is the key scheme flag — strip it
    const rawKey = keyBytes.length === 33 ? keyBytes.slice(1) : keyBytes;
    this.keypair = Ed25519Keypair.fromSecretKey(rawKey);
  }

  /** Start the polling loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const addr = this.keypair.getPublicKey().toSuiAddress();
    console.log(
      `[cleanup] Starting cleanup worker (interval=${this.config.cleanup.intervalMs}ms, ` +
      `delay=${this.config.cleanup.delayMs}ms, address=${addr})`,
    );
    this.poll();
  }

  /** Stop the polling loop. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[cleanup] Stopped. Total jobs processed: ${this.jobsProcessed}`);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      await this.enqueueNewJobs();
      await this.processPendingJobs();
    } catch (err) {
      console.error("[cleanup] Poll error:", err);
    }

    if (this.running) {
      this.timer = setTimeout(() => this.poll(), this.config.cleanup.intervalMs);
    }
  }

  // ================================================================
  // Enqueue: scan completed events → insert pending cleanup jobs
  // ================================================================

  private async enqueueNewJobs(): Promise<void> {
    const existingIds = await getExistingCleanupContractIds(this.pool);

    // Find ContractCompletedEvent entries not yet in cleanup_jobs
    const tcCompleted = await this.pool.query(
      `SELECT primary_id, event_data, timestamp_ms
       FROM events
       WHERE event_name = 'ContractCompletedEvent'
       ORDER BY id ASC`,
    );

    // Find MultiInputContractCompletedEvent entries not yet in cleanup_jobs
    const micCompleted = await this.pool.query(
      `SELECT primary_id, event_data, timestamp_ms
       FROM events
       WHERE event_name = 'MultiInputContractCompletedEvent'
       ORDER BY id ASC`,
    );

    let enqueued = 0;

    for (const row of tcCompleted.rows as { primary_id: string; event_data: string; timestamp_ms: string }[]) {
      if (existingIds.has(row.primary_id)) continue;

      // Look up the creation event to get contract_type, poster_id, source_ssu_id
      const meta = await this.getContractCreationMeta(row.primary_id);

      await insertCleanupJob(
        this.pool,
        row.primary_id,
        "trustless_contracts",
        meta.contractType,
        meta.posterId,
        meta.sourceSsuId,
        new Date(Number(row.timestamp_ms)).toISOString(),
      );
      existingIds.add(row.primary_id);
      enqueued++;
    }

    for (const row of micCompleted.rows as { primary_id: string; event_data: string; timestamp_ms: string }[]) {
      if (existingIds.has(row.primary_id)) continue;

      const eventData = typeof row.event_data === "string" ? JSON.parse(row.event_data) : row.event_data;

      await insertCleanupJob(
        this.pool,
        row.primary_id,
        "trustless_contracts",
        "MultiInput",
        eventData.poster_id ?? null,
        null,
        new Date(Number(row.timestamp_ms)).toISOString(),
      );
      existingIds.add(row.primary_id);
      enqueued++;
    }

    if (enqueued > 0) {
      console.log(`[cleanup] Enqueued ${enqueued} new cleanup job(s)`);
    }
  }

  /**
   * Look up the ContractCreatedEvent for a trustless contract to extract
   * contract_type variant, poster_id, and source_ssu_id (for item contracts).
   */
  private async getContractCreationMeta(contractId: string): Promise<{
    contractType: string | null;
    posterId: string | null;
    sourceSsuId: string | null;
  }> {
    const result = await this.pool.query(
      `SELECT event_data FROM events
       WHERE event_name = 'ContractCreatedEvent' AND primary_id = $1
       LIMIT 1`,
      [contractId],
    );

    if (result.rows.length === 0) {
      return { contractType: null, posterId: null, sourceSsuId: null };
    }

    const data = typeof result.rows[0].event_data === "string"
      ? JSON.parse(result.rows[0].event_data)
      : result.rows[0].event_data;

    const posterId = data.poster_id ?? null;
    const ct = data.contract_type ?? {};

    // The contract_type is an enum variant object like { "CoinForCoin": { ... } }
    const variant = Object.keys(ct)[0] ?? null;
    let sourceSsuId: string | null = null;

    if (variant && ct[variant]) {
      sourceSsuId = ct[variant].source_ssu_id ?? null;
    }

    return { contractType: variant, posterId, sourceSsuId };
  }

  // ================================================================
  // Process: execute cleanup transactions for pending jobs
  // ================================================================

  private async processPendingJobs(): Promise<void> {
    const jobs = await getPendingCleanupJobs(
      this.pool,
      this.config.cleanup.delayMs,
      10,
    );

    for (const job of jobs) {
      try {
        await this.processJob(job);
        this.jobsProcessed++;
      } catch (err) {
        console.error(`[cleanup] Error processing job ${job.id} (contract ${job.contract_id}):`, err);
      }
    }
  }

  private async processJob(job: {
    id: number;
    contract_id: string;
    contract_module: string;
    contract_type: string | null;
    poster_id: string | null;
    source_ssu_id: string | null;
  }): Promise<void> {
    // 1. Verify the object still exists on-chain
    try {
      const obj = await this.client.getObject({ id: job.contract_id });
      if (!obj.data) {
        // Object already deleted (cleaned up by someone else)
        console.log(`[cleanup] Contract ${job.contract_id} already deleted, marking not_found`);
        await markCleanupNotFound(this.pool, job.id);
        return;
      }
    } catch {
      // Object not found or RPC error — mark as not_found
      console.log(`[cleanup] Contract ${job.contract_id} not found on-chain, marking not_found`);
      await markCleanupNotFound(this.pool, job.id);
      return;
    }

    // 2. Build the cleanup transaction
    let tx: Transaction;

    if (job.contract_module === "trustless_contracts" && job.contract_type === "MultiInput") {
      tx = buildCleanupMultiInputContract(this.config, job.contract_id);
    } else if (isItemContract(job.contract_type)) {
      // Item-bearing trustless contract needs poster + SSU
      if (!job.poster_id || !job.source_ssu_id) {
        console.warn(
          `[cleanup] Job ${job.id}: item contract missing poster_id or source_ssu_id, skipping`,
        );
        await markCleanupFailed(
          this.pool, job.id,
          "Missing poster_id or source_ssu_id for item contract cleanup",
          this.config.cleanup.maxRetries,
        );
        return;
      }
      tx = buildCleanupCompletedItemContract(
        this.config,
        job.contract_id,
        job.poster_id,
        job.source_ssu_id,
      );
    } else {
      // Coin-only trustless contract
      tx = buildCleanupCompletedContract(this.config, job.contract_id);
    }

    // 3. Sign and execute
    try {
      tx.setSender(this.keypair.getPublicKey().toSuiAddress());

      const txBytes = await tx.build({ client: this.client });
      const { signature } = await this.keypair.signTransaction(txBytes);

      const result = await this.client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true },
      });

      // 4. Extract storage rebate from effects
      const effects = result.effects;
      if (effects?.status?.status === "success") {
        const gasUsed = effects.gasUsed;
        const storageRebate = BigInt(gasUsed?.storageRebate ?? "0");
        const computationCost = BigInt(gasUsed?.computationCost ?? "0");
        const storageCost = BigInt(gasUsed?.storageCost ?? "0");

        await markCleanupConfirmed(
          this.pool,
          job.id,
          result.digest,
          storageRebate,
          computationCost,
          storageCost,
        );

        const netMist = storageRebate - computationCost - storageCost;
        console.log(
          `[cleanup] ✓ Contract ${job.contract_id} cleaned up ` +
          `(rebate=${storageRebate} MIST, net=${netMist} MIST, tx=${result.digest})`,
        );
      } else {
        const errMsg = effects?.status?.error ?? "Transaction failed with unknown error";
        console.warn(`[cleanup] Transaction failed for ${job.contract_id}: ${errMsg}`);
        await markCleanupFailed(this.pool, job.id, errMsg, this.config.cleanup.maxRetries);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[cleanup] Execution error for ${job.contract_id}: ${errMsg}`);
      await markCleanupFailed(this.pool, job.id, errMsg, this.config.cleanup.maxRetries);
    }
  }
}
