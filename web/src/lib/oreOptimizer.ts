/**
 * oreOptimizer — post-pass ore optimization for multi-output recipes.
 *
 * When multiple intermediates share a common ore source (e.g. Feldspar Crystals
 * producing both Hydrocarbon Residue and Silica Grains), the tree resolver
 * handles byproduct crediting during resolution. This module provides an
 * additional "ore summary" view that groups leaf-level demands by their
 * refining recipe and computes the minimum ore runs to satisfy all co-products,
 * surfacing surplus byproducts.
 */

import type { RecipeData } from "./types";
import type { LeafMaterial } from "../hooks/useOptimizer";

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
/* Ore optimization post-pass                                          */
/* ------------------------------------------------------------------ */

/**
 * Given the flat leaf material list from tree resolution, group demands
 * by their shared refining recipe and compute the minimum ore runs to
 * satisfy all co-products simultaneously.
 *
 * For each multi-output refining recipe that produces at least one
 * demanded leaf material, we compute:
 *   runs = max(ceil(needed_i / perRun_i)) across all demanded outputs i
 *
 * This yields the minimum runs that satisfy every co-product, and any
 * excess is reported as surplus.
 */
export function optimizeOreUsage(
  leafMaterials: LeafMaterial[],
  byproductIndex: Map<number, RefiningSource[]>,
): OreSummary {
  // Build a mutable demand map from leaf materials.
  const demand = new Map<number, number>();
  for (const m of leafMaterials) {
    demand.set(m.typeId, (demand.get(m.typeId) ?? 0) + m.quantity);
  }

  // Track which leaf typeIds are consumed by ore optimization.
  const consumed = new Set<number>();

  // Group by recipe (use outputTypeId as key since each recipe has a unique primary output).
  // For each recipe, collect all demanded outputs.
  const recipeGroups = new Map<
    number,
    { recipe: RecipeData; demandedOutputs: { typeId: number; quantityPerRun: number; needed: number }[] }
  >();

  for (const [typeId, sources] of byproductIndex) {
    const needed = demand.get(typeId);
    if (needed == null || needed <= 0) continue;

    // Pick the first refining source for this output.
    // (In theory a material could be produced by multiple recipes — we take the first.)
    for (const source of sources) {
      const key = source.recipe.outputTypeId;
      let group = recipeGroups.get(key);
      if (!group) {
        group = { recipe: source.recipe, demandedOutputs: [] };
        recipeGroups.set(key, group);
      }
      // Avoid duplicates (same typeId added from multiple sources of same recipe).
      if (!group.demandedOutputs.some((d) => d.typeId === typeId)) {
        group.demandedOutputs.push({
          typeId,
          quantityPerRun: source.quantityPerRun,
          needed,
        });
      }
      break; // Use first source only.
    }
  }

  const entries: OreSummaryEntry[] = [];

  for (const [, group] of recipeGroups) {
    const { recipe, demandedOutputs } = group;
    if (demandedOutputs.length === 0) continue;

    // Minimum runs to satisfy all demanded outputs.
    const runs = Math.max(
      ...demandedOutputs.map((d) => Math.ceil(d.needed / d.quantityPerRun)),
    );

    // Ore input: recipe.inputs[0] is the ore (refining recipes have a single ore input).
    const oreInput = recipe.inputs[0];
    const totalUnits = oreInput.quantity * runs;

    // Build full product list (all outputs of this recipe, not just demanded ones).
    const allOutputs: { typeId: number; quantityPerRun: number }[] = [
      { typeId: recipe.outputTypeId, quantityPerRun: recipe.outputQuantity },
      ...(recipe.secondaryOutputs ?? []).map((so) => ({
        typeId: so.typeId,
        quantityPerRun: so.quantity,
      })),
    ];

    const products: OreProduct[] = allOutputs.map((out) => {
      const needed = demand.get(out.typeId) ?? 0;
      const produced = out.quantityPerRun * runs;
      return {
        typeId: out.typeId,
        needed,
        produced,
        surplus: Math.max(0, produced - needed),
      };
    });

    // Mark all outputs of this recipe as consumed.
    for (const out of allOutputs) {
      if (demand.has(out.typeId)) {
        consumed.add(out.typeId);
      }
    }

    entries.push({
      oreTypeId: oreInput.typeId,
      totalUnits,
      runs,
      inputPerRun: oreInput.quantity,
      products,
    });
  }

  // Sort by total ore units descending.
  entries.sort((a, b) => b.totalUnits - a.totalUnits);

  // Collect unoptimized leaf materials (not part of any multi-output recipe).
  const unoptimized: LeafMaterial[] = leafMaterials.filter(
    (m) => !consumed.has(m.typeId),
  );

  const totalOreUnits = entries.reduce((sum, e) => sum + e.totalUnits, 0);

  return { entries, totalOreUnits, unoptimized };
}
