/**
 * useOptimizer — browser port of the CLI optimizer.
 *
 * Performs recipe tree resolution and gap analysis in-memory
 * using recipe data fetched from the registry.
 *
 * v2: intermediate-aware resolution (stops expanding when SSU inventory
 * satisfies a node), blueprint/facility selection per tree node.
 */

import { useMemo, useState, useCallback } from "react";
import type { RecipeData, InputRequirement } from "../lib/types";
import type { BlueprintRecipe } from "./useBlueprints";
import { buildRecipeMap } from "../lib/bom";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ResolvedNode {
  typeId: number;
  quantityNeeded: number;
  runs: number;
  quantityPerRun: number;
  isCraftable: boolean;
  /** True when SSU inventory fully covers this node (children not expanded). */
  satisfiedFromInventory: boolean;
  /** Blueprint used for this crafting step (undefined for raw materials). */
  blueprintId?: number;
  /** Facility required for this crafting step. */
  facilityName?: string;
  children: ResolvedNode[];
}

export interface LeafMaterial {
  typeId: number;
  quantity: number;
}

export interface GapItem {
  typeId: number;
  required: number;
  onHand: number;
  missing: number;
}

export interface GapAnalysis {
  shoppingList: GapItem[];
  satisfied: GapItem[];
  totalRequired: number;
  totalOnHand: number;
  totalMissing: number;
}

export type Inventory = Map<number, number>;

/** Callback that picks the active recipe for a given output typeId. */
export type RecipeLookup = (typeId: number) => BlueprintRecipe | RecipeData | undefined;

/* ------------------------------------------------------------------ */
/* Resolver                                                            */
/* ------------------------------------------------------------------ */

function resolveNode(
  getRecipe: RecipeLookup,
  typeId: number,
  quantityNeeded: number,
  inventory: Inventory,
  visited: Set<number>,
): ResolvedNode {
  // Check if inventory fully satisfies this node (intermediate-aware).
  const onHand = inventory.get(typeId) ?? 0;
  if (onHand >= quantityNeeded) {
    // Consume from inventory and stop recursing.
    inventory.set(typeId, onHand - quantityNeeded);
    return {
      typeId,
      quantityNeeded,
      runs: 0,
      quantityPerRun: 0,
      isCraftable: false,
      satisfiedFromInventory: true,
      children: [],
    };
  }

  // Partially satisfied — reduce what we need to craft.
  let remaining = quantityNeeded;
  let fromInventory = false;
  if (onHand > 0) {
    remaining -= onHand;
    inventory.set(typeId, 0);
    fromInventory = true;
  }

  const recipe = getRecipe(typeId);

  if (!recipe || visited.has(typeId)) {
    return {
      typeId,
      quantityNeeded,
      runs: 0,
      quantityPerRun: 0,
      isCraftable: false,
      satisfiedFromInventory: false,
      children: [],
    };
  }

  const runs = Math.ceil(remaining / recipe.outputQuantity);
  visited.add(typeId);

  const children = recipe.inputs.map((input: InputRequirement) => {
    return resolveNode(getRecipe, input.typeId, input.quantity * runs, inventory, visited);
  });

  visited.delete(typeId);

  // Extract blueprint metadata if available.
  const bpRecipe = recipe as BlueprintRecipe;

  return {
    typeId,
    quantityNeeded,
    runs,
    quantityPerRun: recipe.outputQuantity,
    isCraftable: true,
    satisfiedFromInventory: fromInventory,
    blueprintId: bpRecipe.blueprintId,
    facilityName: bpRecipe.facilityName,
    children,
  };
}

function collectLeaves(node: ResolvedNode, acc: Map<number, number>) {
  // Inventory-satisfied nodes are "virtual leaves" — already covered.
  if (node.satisfiedFromInventory && !node.isCraftable) {
    return;
  }
  if (!node.isCraftable) {
    acc.set(node.typeId, (acc.get(node.typeId) ?? 0) + node.quantityNeeded);
    return;
  }
  for (const child of node.children) {
    collectLeaves(child, acc);
  }
}

function analyzeGaps(leafMaterials: LeafMaterial[], inventory: Inventory): GapAnalysis {
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
      required: mat.quantity,
      onHand: Math.min(onHand, mat.quantity),
      missing,
    };

    totalRequired += mat.quantity;
    totalOnHand += item.onHand;
    totalMissing += missing;

    if (missing > 0) shoppingList.push(item);
    else satisfied.push(item);
  }

  shoppingList.sort((a, b) => b.missing - a.missing);
  return { shoppingList, satisfied, totalRequired, totalOnHand, totalMissing };
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useOptimizer(recipes: RecipeData[]) {
  const recipeMap = useMemo(() => buildRecipeMap(recipes), [recipes]);

  const [result, setResult] = useState<{
    tree: ResolvedNode;
    leafMaterials: LeafMaterial[];
    gaps: GapAnalysis;
  } | null>(null);

  const optimize = useCallback(
    (
      targetTypeId: number,
      targetQuantity: number,
      inventory: Inventory = new Map(),
      recipeLookup?: RecipeLookup,
    ) => {
      // Clone inventory so consumption during resolution doesn't mutate caller's map.
      const inv = new Map(inventory);

      const getRecipe: RecipeLookup = recipeLookup ?? ((id) => recipeMap.get(id));
      const tree = resolveNode(getRecipe, targetTypeId, targetQuantity, inv, new Set());

      const leafMap = new Map<number, number>();
      collectLeaves(tree, leafMap);
      const leafMaterials: LeafMaterial[] = Array.from(leafMap.entries())
        .map(([typeId, quantity]) => ({ typeId, quantity }))
        .sort((a, b) => b.quantity - a.quantity);

      // Gap analysis uses the *original* inventory (not the consumed clone).
      const gaps = analyzeGaps(leafMaterials, inventory);
      setResult({ tree, leafMaterials, gaps });
    },
    [recipeMap],
  );

  const clear = useCallback(() => setResult(null), []);

  return { result, optimize, clear };
}
