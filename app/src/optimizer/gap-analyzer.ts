/**
 * Gap Analyzer — computes what's missing given current inventory and a build goal.
 *
 * Takes the flat leaf materials from the recipe resolver and subtracts what's
 * already in inventory. Outputs a shopping list of what needs to be gathered
 * or delivered.
 */

import type { LeafMaterial } from "./recipe-resolver.js";

// ============================================================
// Types
// ============================================================

/** Inventory: typeId → quantity on hand */
export type Inventory = Map<number, number>;

export interface GapItem {
  typeId: number;
  name: string;
  /** Total quantity required by the recipe tree */
  required: number;
  /** Quantity currently in inventory */
  onHand: number;
  /** Quantity still needed (required - onHand, clamped to 0) */
  missing: number;
}

export interface GapAnalysis {
  /** Items that are fully or partially missing */
  shoppingList: GapItem[];
  /** Items that are fully satisfied by inventory */
  satisfied: GapItem[];
  /** Summary stats */
  totalRequired: number;
  totalOnHand: number;
  totalMissing: number;
}

// ============================================================
// Analyzer
// ============================================================

/**
 * Computes the gap between required leaf materials and current inventory.
 *
 * @param leafMaterials - From collectLeafMaterials()
 * @param inventory - Current inventory (typeId → quantity)
 * @returns Gap analysis with shopping list and satisfied items
 */
export function analyzeGaps(
  leafMaterials: LeafMaterial[],
  inventory: Inventory,
): GapAnalysis {
  const shoppingList: GapItem[] = [];
  const satisfied: GapItem[] = [];
  let totalRequired = 0;
  let totalOnHand = 0;
  let totalMissing = 0;

  for (const mat of leafMaterials) {
    const onHand = inventory.get(mat.typeId) ?? 0;
    const missing = Math.max(0, mat.quantity - onHand);

    const item: GapItem = {
      typeId: mat.typeId,
      name: mat.name,
      required: mat.quantity,
      onHand: Math.min(onHand, mat.quantity), // cap at required
      missing,
    };

    totalRequired += mat.quantity;
    totalOnHand += item.onHand;
    totalMissing += missing;

    if (missing > 0) {
      shoppingList.push(item);
    } else {
      satisfied.push(item);
    }
  }

  // Sort shopping list by missing quantity (most needed first)
  shoppingList.sort((a, b) => b.missing - a.missing);

  return { shoppingList, satisfied, totalRequired, totalOnHand, totalMissing };
}

/**
 * Parses an inventory string like '{"89258":100,"89259":200}' into an Inventory map.
 */
export function parseInventory(json: string): Inventory {
  const obj: Record<string, number> = JSON.parse(json);
  const inv = new Map<number, number>();
  for (const [key, val] of Object.entries(obj)) {
    inv.set(Number(key), val);
  }
  return inv;
}

/**
 * Prints a human-readable gap analysis to console.
 */
export function printGapAnalysis(analysis: GapAnalysis): void {
  if (analysis.shoppingList.length === 0) {
    console.log("\n✓ All materials satisfied by inventory!");
    return;
  }

  console.log("\n=== Shopping List (missing resources) ===");
  for (const item of analysis.shoppingList) {
    const pct = ((item.onHand / item.required) * 100).toFixed(0);
    console.log(
      `  ${item.name} (${item.typeId}): need ${item.missing} more (have ${item.onHand}/${item.required}, ${pct}%)`,
    );
  }

  if (analysis.satisfied.length > 0) {
    console.log("\n=== Satisfied (already in inventory) ===");
    for (const item of analysis.satisfied) {
      console.log(`  ${item.name} (${item.typeId}): ${item.required} ✓`);
    }
  }

  console.log(
    `\nTotal: ${analysis.totalOnHand}/${analysis.totalRequired} on hand, ${analysis.totalMissing} missing`,
  );
}
