/**
 * Job Generator — creates Contract Board delivery job parameters from gap analysis.
 *
 * For each missing resource in the shopping list, generates the parameters needed
 * to call `contract_board::create_job` or `create_job_from_treasury` with
 * `CompletionType::Delivery`.
 *
 * This is the Forge Planner → Contract Board bridge:
 *   Manufacturing order → recipe resolution → gap analysis → delivery jobs
 */

import type { GapItem, GapAnalysis } from "./gap-analyzer.js";

// ============================================================
// Types
// ============================================================

/** Parameters for a single delivery job on the Contract Board. */
export interface DeliveryJobParams {
  /** Human-readable description for the job posting */
  description: string;
  /** CompletionType::Delivery fields */
  completionType: {
    variant: "Delivery";
    storageUnitId: string;
    typeId: number;
    quantity: number;
  };
  /** Suggested escrow amount (proportional to quantity) */
  suggestedEscrow: number;
  /** Minimum reputation for accepting (0 for public) */
  minReputation: number;
}

export interface JobGenerationResult {
  jobs: DeliveryJobParams[];
  /** Total suggested escrow across all jobs */
  totalEscrow: number;
}

// ============================================================
// Generator
// ============================================================

/**
 * Generates delivery job parameters from gap analysis results.
 *
 * @param analysis - From analyzeGaps()
 * @param storageUnitId - Target StorageUnit Sui object ID for deliveries
 * @param escrowPerUnit - Escrow amount per unit of material (in smallest token denomination)
 * @param minReputation - Minimum tribe reputation required to accept jobs
 * @returns List of delivery job parameters ready for PTB construction
 */
export function generateDeliveryJobs(
  analysis: GapAnalysis,
  storageUnitId: string,
  escrowPerUnit: number = 1,
  minReputation: number = 0,
): JobGenerationResult {
  const jobs: DeliveryJobParams[] = [];
  let totalEscrow = 0;

  for (const item of analysis.shoppingList) {
    const escrow = item.missing * escrowPerUnit;
    totalEscrow += escrow;

    jobs.push({
      description: `Deliver ${item.missing}× ${item.name} (type ${item.typeId}) to storage unit`,
      completionType: {
        variant: "Delivery",
        storageUnitId,
        typeId: item.typeId,
        quantity: item.missing,
      },
      suggestedEscrow: escrow,
      minReputation,
    });
  }

  return { jobs, totalEscrow };
}

/**
 * Prints generated jobs to console.
 */
export function printJobs(result: JobGenerationResult): void {
  if (result.jobs.length === 0) {
    console.log("\nNo delivery jobs needed — all materials available.");
    return;
  }

  console.log(`\n=== Generated ${result.jobs.length} Delivery Job(s) ===`);
  for (const [i, job] of result.jobs.entries()) {
    console.log(`\n  Job ${i + 1}: ${job.description}`);
    console.log(`    type_id: ${job.completionType.typeId}`);
    console.log(`    quantity: ${job.completionType.quantity}`);
    console.log(`    storage_unit: ${job.completionType.storageUnitId}`);
    console.log(`    escrow: ${job.suggestedEscrow}`);
    console.log(`    min_reputation: ${job.minReputation}`);
  }

  console.log(`\n  Total escrow required: ${result.totalEscrow}`);
}
