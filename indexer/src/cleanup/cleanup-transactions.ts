/**
 * Cleanup Transaction Builders — server-side PTB constructors for
 * garbage-collecting completed contract objects.
 *
 * Mirrors the web UI builders in web/src/lib/sui.ts but operates
 * server-side with configurable package IDs and coin types.
 */

import { Transaction } from "@mysten/sui/transactions";
import type { IndexerConfig } from "../types.js";

// ============================================================
// Trustless Contracts cleanup
// ============================================================

/**
 * Build a cleanup transaction for a completed coin-only trustless contract
 * (CoinForCoin, CoinForItem, or Transport).
 */
export function buildCleanupCompletedContract(
  config: IndexerConfig,
  contractId: string,
): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(config.cleanup.gasBudget);
  tx.moveCall({
    target: `${config.packageIds.trustlessContracts}::trustless_contracts::cleanup_completed_contract`,
    typeArguments: [config.cleanup.coinType, config.cleanup.fillCoinType],
    arguments: [tx.object(contractId)],
  });
  return tx;
}

/**
 * Build a cleanup transaction for a completed item-bearing trustless contract
 * (ItemForCoin or ItemForItem). Requires the poster's Character and source SSU.
 */
export function buildCleanupCompletedItemContract(
  config: IndexerConfig,
  contractId: string,
  posterCharacterId: string,
  sourceSsuId: string,
): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(config.cleanup.gasBudget);
  tx.moveCall({
    target: `${config.packageIds.trustlessContracts}::trustless_contracts::cleanup_completed_item_contract`,
    typeArguments: [config.cleanup.coinType, config.cleanup.fillCoinType],
    arguments: [
      tx.object(contractId),
      tx.object(posterCharacterId),
      tx.object(sourceSsuId),
    ],
  });
  return tx;
}

// ============================================================
// Multi-Input Contract cleanup
// ============================================================

/**
 * Build a cleanup transaction for a completed multi-input contract.
 */
export function buildCleanupMultiInputContract(
  config: IndexerConfig,
  contractId: string,
): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(config.cleanup.gasBudget);
  tx.moveCall({
    target: `${config.packageIds.multiInputContract}::multi_input_contract::cleanup`,
    typeArguments: [config.cleanup.coinType],
    arguments: [tx.object(contractId)],
  });
  return tx;
}

// ============================================================
// Contract type classification
// ============================================================

/** Item-bearing trustless contract types that require poster + SSU args. */
const ITEM_CONTRACT_TYPES = new Set(["ItemForCoin", "ItemForItem"]);

export function isItemContract(contractType: string | null): boolean {
  return contractType != null && ITEM_CONTRACT_TYPES.has(contractType);
}
