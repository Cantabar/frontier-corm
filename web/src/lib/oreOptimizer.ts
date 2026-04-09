/**
 * oreOptimizer — joint cross-ore optimization for multi-output recipes.
 *
 * When a build requires intermediates produced by multiple ores with
 * overlapping outputs (e.g. both Feldspar Crystals and Hydrated Sulfide
 * Matrix produce Hydrocarbon Residue), the tree resolver's DFS byproduct
 * crediting is order-dependent and may not find the globally optimal
 * allocation. This module extracts intermediate demands at the refining
 * boundary and jointly optimizes ore runs across all ore types, accounting
 * for shared byproducts.
 *
 * Algorithm:
 *   1. collectRefiningDemands — walk the resolved tree and collect demands
 *      for intermediates produced by multi-output recipes (the refining
 *      boundary), rather than at the raw-ore leaf level.
 *   2. optimizeOreUsage — jointly optimize ore runs:
 *      Phase 1 (forced ores): ores that are the sole source for an
 *        intermediate are forced; compute minimum runs.
 *      Phase 2 (surplus propagation): credit all outputs from forced
 *        ore runs against remaining demands.
 *      Phase 3 (greedy fill): assign additional runs to the most
 *        efficient ore for any remaining shared-intermediate demands.
 */

import type { RecipeData } from "./types";
import type { ResolvedNode, LeafMaterial } from "../hooks/useOptimizer";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface OreProduct {
  typeId: number;
  /** Quantity needed by the build plan. */
  needed: number;
  /** Quantity produced by the optimized ore runs. */
  produced: number;
  /** Surplus = produced - needed (≥ 0). */
  surplus: number;
}

export interface OreSummaryEntry {
  /** The ore (raw input) typeId. */
  oreTypeId: number;
  /** Total ore units to mine. */
  totalUnits: number;
  /** Number of refining runs. */
  runs: number;
  /** Input quantity per run. */
  inputPerRun: number;
  /** Products yielded by this ore's refining recipe. */
  products: OreProduct[];
}

export interface OreSummary {
  entries: OreSummaryEntry[];
  /** Total ore units across all ore types. */
  totalOreUnits: number;
  /** Leaf materials that are NOT produced by any multi-output refining recipe. */
  unoptimized: LeafMaterial[];
}

/* ------------------------------------------------------------------ */
/* Reverse index: output typeId → refining recipes that produce it     */
/* ------------------------------------------------------------------ */

interface RefiningSource {
  recipe: RecipeData;
  /** Index in [primaryOutput, ...secondaryOutputs] — 0 = primary. */
  outputIndex: number;
  /** Quantity of this output per run. */
  quantityPerRun: number;
}

/**
 * Build a map from every output typeId to the refining recipes that produce it.
 * Only includes recipes that have secondary outputs (multi-output recipes).
 */
export function buildByproductIndex(
  recipes: RecipeData[],
): Map<number, RefiningSource[]> {
  const index = new Map<number, RefiningSource[]>();

  for (const recipe of recipes) {
    if (!recipe.secondaryOutputs || recipe.secondaryOutputs.length === 0) continue;

    // Primary output
    const primaryEntry: RefiningSource = {
      recipe,
      outputIndex: 0,
      quantityPerRun: recipe.outputQuantity,
    };
    const existing0 = index.get(recipe.outputTypeId);
    if (existing0) existing0.push(primaryEntry);
    else index.set(recipe.outputTypeId, [primaryEntry]);

    // Secondary outputs
    for (let i = 0; i < recipe.secondaryOutputs.length; i++) {
      const so = recipe.secondaryOutputs[i];
      const entry: RefiningSource = {
        recipe,
        outputIndex: i + 1,
        quantityPerRun: so.quantity,
      };
      const existing = index.get(so.typeId);
      if (existing) existing.push(entry);
      else index.set(so.typeId, [entry]);
    }
  }

  return index;
}

/* ------------------------------------------------------------------ */
/* Refining demand extraction from resolved tree                       */
/* ------------------------------------------------------------------ */

export interface RefiningDemands {
  /** Intermediate typeId → total demand from the build. */
  demands: Map<number, number>;
  /** Leaf materials NOT involved in multi-output refining. */
  nonRefiningLeaves: LeafMaterial[];
}

/**
 * Walk the resolved tree and collect intermediate demands at the refining
 * boundary — materials produced by multi-output recipes — rather than at
 * the raw-ore leaf level.
 *
 * Refining nodes (craftable + byproducts) record their `quantityNeeded`
 * and do NOT recurse into ore-input children (the joint optimizer derives
 * those). Non-refining leaves are collected separately.
 */
export function collectRefiningDemands(
  tree: ResolvedNode,
  byproductIndex: Map<number, RefiningSource[]>,
): RefiningDemands {
  const demands = new Map<number, number>();
  const rawLeaves = new Map<number, number>();

  _walkRefining(tree, byproductIndex, demands, rawLeaves);

  const nonRefiningLeaves: LeafMaterial[] = Array.from(rawLeaves.entries())
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  return { demands, nonRefiningLeaves };
}

function _walkRefining(
  node: ResolvedNode,
  byproductIndex: Map<number, RefiningSource[]>,
  demands: Map<number, number>,
  rawLeaves: Map<number, number>,
): void {
  // Craftable node with byproducts → refining step.
  // Record intermediate demand and stop (ore inputs derived by joint optimizer).
  if (node.isCraftable && node.byproducts && node.byproducts.length > 0) {
    demands.set(node.typeId, (demands.get(node.typeId) ?? 0) + node.quantityNeeded);
    return;
  }

  // Normal craftable node (not refining) → recurse into children.
  if (node.isCraftable) {
    for (const child of node.children) {
      _walkRefining(child, byproductIndex, demands, rawLeaves);
    }
    return;
  }

  // Non-craftable node (leaf or inventory-satisfied).
  if (byproductIndex.has(node.typeId)) {
    // Refining intermediate — include for joint optimizer to re-evaluate.
    demands.set(node.typeId, (demands.get(node.typeId) ?? 0) + node.quantityNeeded);
  } else if (!node.satisfiedFromInventory) {
    // Non-refining raw leaf (not covered by SSU).
    rawLeaves.set(node.typeId, (rawLeaves.get(node.typeId) ?? 0) + node.quantityNeeded);
  }
  // else: non-refining material satisfied from SSU — skip.
}

/* ------------------------------------------------------------------ */
/* Joint cross-ore optimization                                        */
/* ------------------------------------------------------------------ */

/** Internal model for an ore type during optimization. */
interface OreModel {
  recipe: RecipeData;
  oreTypeId: number;
  inputPerRun: number;
  outputs: { typeId: number; quantityPerRun: number }[];
  runs: number;
}

/**
 * Jointly optimize ore runs across all ore types to satisfy intermediate
 * demands with minimum total ore units mined.
 *
 * @param refiningDemands  intermediate typeId → total demand (pre-SSU)
 * @param nonRefiningLeaves  leaf materials not involved in multi-output refining
 * @param byproductIndex  reverse index from `buildByproductIndex`
 * @param ssuInventory  optional SSU inventory; on-hand intermediates are deducted
 */
export function optimizeOreUsage(
  refiningDemands: Map<number, number>,
  nonRefiningLeaves: LeafMaterial[],
  byproductIndex: Map<number, RefiningSource[]>,
  ssuInventory?: ReadonlyMap<number, number>,
): OreSummary {
  // ── Net demand after SSU deduction ──
  const demand = new Map<number, number>();
  for (const [typeId, qty] of refiningDemands) {
    const net = Math.max(0, qty - (ssuInventory?.get(typeId) ?? 0));
    if (net > 0) demand.set(typeId, net);
  }

  if (demand.size === 0) {
    return { entries: [], totalOreUnits: 0, unoptimized: nonRefiningLeaves };
  }

  // ── Build ore models ──
  const oreModels = new Map<number, OreModel>();
  const intermediateToOres = new Map<number, number[]>();

  for (const [typeId] of demand) {
    const sources = byproductIndex.get(typeId);
    if (!sources) continue;

    for (const source of sources) {
      const oreTypeId = source.recipe.inputs[0]?.typeId;
      if (oreTypeId == null) continue;

      if (!oreModels.has(oreTypeId)) {
        oreModels.set(oreTypeId, {
          recipe: source.recipe,
          oreTypeId,
          inputPerRun: source.recipe.inputs[0].quantity,
          outputs: [
            { typeId: source.recipe.outputTypeId, quantityPerRun: source.recipe.outputQuantity },
            ...(source.recipe.secondaryOutputs ?? []).map((so) => ({
              typeId: so.typeId,
              quantityPerRun: so.quantity,
            })),
          ],
          runs: 0,
        });
      }

      const ores = intermediateToOres.get(typeId) ?? [];
      if (!ores.includes(oreTypeId)) ores.push(oreTypeId);
      intermediateToOres.set(typeId, ores);
    }
  }

  // ── Phase 1: Forced ores ──
  const remaining = new Map(demand);

  for (const [typeId, ores] of intermediateToOres) {
    if (ores.length !== 1) continue;
    const model = oreModels.get(ores[0])!;
    const needed = remaining.get(typeId) ?? 0;
    if (needed <= 0) continue;

    const out = model.outputs.find((o) => o.typeId === typeId);
    if (!out) continue;

    model.runs = Math.max(model.runs, Math.ceil(needed / out.quantityPerRun));
  }

  // ── Phase 2: Surplus propagation from forced ores ──
  for (const [, model] of oreModels) {
    if (model.runs === 0) continue;
    for (const out of model.outputs) {
      const cur = remaining.get(out.typeId);
      if (cur != null && cur > 0) {
        remaining.set(out.typeId, Math.max(0, cur - out.quantityPerRun * model.runs));
      }
    }
  }

  // ── Phase 3: Greedy fill for remaining shared demands ──
  for (let iter = 0; iter < 100; iter++) {
    let bestTypeId = -1;
    let bestQty = 0;
    for (const [typeId, qty] of remaining) {
      if (qty > bestQty) { bestQty = qty; bestTypeId = typeId; }
    }
    if (bestQty <= 0) break;

    const candidateOres = intermediateToOres.get(bestTypeId);
    if (!candidateOres || candidateOres.length === 0) break;

    // Pick the most ore-efficient source.
    let bestOreId = candidateOres[0];
    let bestEff = 0;
    for (const oreId of candidateOres) {
      const m = oreModels.get(oreId)!;
      const o = m.outputs.find((x) => x.typeId === bestTypeId);
      if (!o) continue;
      const eff = o.quantityPerRun / m.inputPerRun;
      if (eff > bestEff) { bestEff = eff; bestOreId = oreId; }
    }

    const model = oreModels.get(bestOreId)!;
    const output = model.outputs.find((o) => o.typeId === bestTypeId);
    if (!output) break;

    const additional = Math.ceil(bestQty / output.quantityPerRun);
    model.runs += additional;

    for (const out of model.outputs) {
      const cur = remaining.get(out.typeId);
      if (cur != null && cur > 0) {
        remaining.set(out.typeId, Math.max(0, cur - out.quantityPerRun * additional));
      }
    }
  }

  // ── Build OreSummary entries ──
  // Attribute demand to each ore by consuming from a shrinking pool.
  const remainingForAttribution = new Map(demand);
  const entries: OreSummaryEntry[] = [];

  for (const [, model] of oreModels) {
    if (model.runs === 0) continue;

    const products: OreProduct[] = model.outputs.map((out) => {
      const produced = out.quantityPerRun * model.runs;
      const totalNeeded = remainingForAttribution.get(out.typeId) ?? 0;
      const attributed = Math.min(produced, totalNeeded);
      if (totalNeeded > 0) {
        remainingForAttribution.set(out.typeId, totalNeeded - attributed);
      }
      return {
        typeId: out.typeId,
        needed: attributed,
        produced,
        surplus: Math.max(0, produced - attributed),
      };
    });

    entries.push({
      oreTypeId: model.oreTypeId,
      totalUnits: model.inputPerRun * model.runs,
      runs: model.runs,
      inputPerRun: model.inputPerRun,
      products,
    });
  }

  // Any remaining refining demands not covered go to unoptimized.
  const extraUnoptimized: LeafMaterial[] = [];
  for (const [typeId, qty] of remaining) {
    if (qty > 0) extraUnoptimized.push({ typeId, quantity: qty });
  }

  entries.sort((a, b) => b.totalUnits - a.totalUnits);
  const totalOreUnits = entries.reduce((sum, e) => sum + e.totalUnits, 0);
  const unoptimized = [...nonRefiningLeaves, ...extraUnoptimized];

  return { entries, totalOreUnits, unoptimized };
}
