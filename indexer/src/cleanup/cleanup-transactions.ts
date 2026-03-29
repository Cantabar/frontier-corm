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
// Variant → module mapping (mirrors on-chain module names)
// ============================================================

const VARIANT_MODULE: Record<string, string> = {
  CoinForCoin: "coin_for_coin",
  CoinForItem: "coin_for_item",
  ItemForCoin: "item_for_coin",
  ItemForItem: "item_for_item",
  Transport: "transport",
};

function moduleFor(contractType: string | null, fallback: string): string {
  return (contractType && VARIANT_MODULE[contractType]) ?? fallback;
}

// ============================================================
// Trustless Contracts cleanup
// ============================================================

/**
 * Build a cleanup transaction for a completed coin-only trustless contract
 * (CoinForCoin or CoinForItem).
 */
export function buildCleanupCompletedContract(
  config: IndexerConfig,
  contractId: string,
  contractType: string | null,
): Transaction {
  const mod = moduleFor(contractType, "coin_for_coin");
  const tx = new Transaction();
  tx.setGasBudget(config.cleanup.gasBudget);
  tx.moveCall({
    target: `${config.packageIds.trustlessContracts}::${mod}::cleanup`,
    typeArguments: [config.cleanup.coinType, config.cleanup.fillCoinType],
    arguments: [tx.object(contractId)],
  });
  return tx;
}

/**
 * Build a cleanup transaction for a completed item-bearing trustless contract
 * (ItemForCoin, ItemForItem, or Transport). Requires the poster's Character and source SSU.
 */
export function buildCleanupCompletedItemContract(
  config: IndexerConfig,
  contractId: string,
  posterCharacterId: string,
  sourceSsuId: string,
  contractType: string | null,
): Transaction {
  const mod = moduleFor(contractType, "item_for_coin");
  const tx = new Transaction();
  tx.setGasBudget(config.cleanup.gasBudget);
  tx.moveCall({
    target: `${config.packageIds.trustlessContracts}::${mod}::cleanup`,
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
    target: `${config.packageIds.trustlessContracts}::multi_input::cleanup`,
    typeArguments: [config.cleanup.coinType],
    arguments: [tx.object(contractId)],
  });
  return tx;
}

// ============================================================
// Assembly Metadata cleanup
// ============================================================

/**
 * Build a cleanup transaction for a stale assembly metadata entry.
 * Calls assembly_metadata::admin_cleanup(registry, admin_cap, assembly_id).
 */
export function buildCleanupAssemblyMetadata(
  config: IndexerConfig,
  assemblyId: string,
): Transaction {
  const { metadataRegistryId, cormAdminCapId, assemblyMetadataPackageId } = config.cleanup;
  const tx = new Transaction();
  tx.setGasBudget(config.cleanup.gasBudget);
  tx.moveCall({
    target: `${assemblyMetadataPackageId}::assembly_metadata::admin_cleanup`,
    arguments: [
      tx.object(metadataRegistryId),
      tx.object(cormAdminCapId),
      tx.pure.id(assemblyId),
    ],
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
