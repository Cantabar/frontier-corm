#!/usr/bin/env node
/**
 * Forge Optimizer CLI — recipe tree resolution, gap analysis, and delivery job generation.
 *
 * Usage:
 *   npx tsx app/src/optimizer/index.ts --target 77852 --quantity 5
 *   npx tsx app/src/optimizer/index.ts --target 77852 --quantity 5 --inventory '{"84180":10,"84210":20}'
 *   npx tsx app/src/optimizer/index.ts --target 77852 --quantity 5 --storage-unit 0xabc --escrow-per-unit 10
 *
 * Options:
 *   --target <typeId>         Target item type ID to build (required)
 *   --quantity <n>            How many to build (default: 1)
 *   --inventory <json>        Current inventory as JSON: {"typeId": quantity, ...}
 *   --storage-unit <id>       Target StorageUnit Sui object ID for delivery jobs
 *   --escrow-per-unit <n>     Escrow amount per unit of missing material (default: 1)
 *   --min-reputation <n>      Minimum tribe reputation for delivery jobs (default: 0)
 *   --data-dir <path>         Path to static data directory (default: auto-detected)
 */

import { parseArgs } from "node:util";
import { loadRecipeGraph, typeName } from "./blueprint-loader.js";
import { resolveRecipeTree, collectLeafMaterials, printTree } from "./recipe-resolver.js";
import { analyzeGaps, parseInventory, printGapAnalysis } from "./gap-analyzer.js";
import { generateDeliveryJobs, printJobs } from "./job-generator.js";

// ============================================================
// CLI
// ============================================================

const { values } = parseArgs({
  options: {
    target: { type: "string", short: "t" },
    quantity: { type: "string", short: "q", default: "1" },
    inventory: { type: "string", short: "i", default: "{}" },
    "storage-unit": { type: "string", short: "s", default: "0x0000000000000000000000000000000000000000000000000000000000000042" },
    "escrow-per-unit": { type: "string", short: "e", default: "1" },
    "min-reputation": { type: "string", short: "r", default: "0" },
    "data-dir": { type: "string", short: "d" },
  },
  strict: true,
});

const targetTypeId = Number(values.target);
if (!values.target || isNaN(targetTypeId)) {
  console.error("Error: --target <typeId> is required (e.g. --target 77852)");
  process.exit(1);
}

const quantity = Number(values.quantity);
const inventory = parseInventory(values.inventory!);
const storageUnitId = values["storage-unit"]!;
const escrowPerUnit = Number(values["escrow-per-unit"]);
const minReputation = Number(values["min-reputation"]);

// ============================================================
// Run
// ============================================================

// 1. Load recipe graph
const graph = loadRecipeGraph(values["data-dir"]);
const targetName = typeName(graph, targetTypeId);

if (!graph.recipesByOutput.has(targetTypeId)) {
  console.error(`\nError: No recipe found for ${targetName} (type ${targetTypeId})`);
  console.error("This item is a raw material and cannot be crafted.");
  process.exit(1);
}

console.log(`\n=== Build Goal: ${quantity}× ${targetName} (type ${targetTypeId}) ===`);

// 2. Resolve recipe tree
const tree = resolveRecipeTree(graph, targetTypeId, quantity);
console.log("\n=== Dependency Tree ===");
printTree(tree);

// 3. Collect leaf materials
const leafMaterials = collectLeafMaterials(tree);
console.log(`\n=== Raw Materials Required (${leafMaterials.length} types) ===`);
for (const mat of leafMaterials) {
  console.log(`  ${mat.name} (${mat.typeId}): ${mat.quantity}`);
}

// 4. Gap analysis
const analysis = analyzeGaps(leafMaterials, inventory);
printGapAnalysis(analysis);

// 5. Generate delivery jobs (only if there are gaps)
if (analysis.shoppingList.length > 0) {
  const result = generateDeliveryJobs(analysis, storageUnitId, escrowPerUnit, minReputation);
  printJobs(result);
}
