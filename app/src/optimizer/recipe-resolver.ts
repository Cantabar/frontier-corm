/**
 * Recipe Resolver — recursive dependency tree resolution.
 *
 * Given a target item (typeId, quantity) and the recipe graph, walks the
 * dependency tree to compute the full bill of materials:
 *   - Intermediate items that can be crafted (with their own inputs)
 *   - Leaf materials that must be gathered (no recipe exists)
 *
 * Handles:
 *   - Multi-run recipes (output_quantity > 1 per run → compute run count)
 *   - Recursive dependencies (input is itself craftable)
 *   - Cycle detection (prevents infinite loops in malformed data)
 */

import type { RecipeGraph, InputMaterial } from "./blueprint-loader.js";
import { typeName } from "./blueprint-loader.js";

// ============================================================
// Types
// ============================================================

/** A node in the resolved dependency tree. */
export interface ResolvedNode {
  typeId: number;
  name: string;
  /** Total quantity needed */
  quantityNeeded: number;
  /** Number of recipe runs (0 for leaf materials) */
  runs: number;
  /** Quantity produced per run (0 for leaf materials) */
  quantityPerRun: number;
  /** True if this item has a recipe and can be crafted */
  isCraftable: boolean;
  /** Child dependencies (empty for leaf materials) */
  children: ResolvedNode[];
}

/** Flat summary of all leaf materials needed (cannot be crafted further). */
export interface LeafMaterial {
  typeId: number;
  name: string;
  quantity: number;
}

// ============================================================
// Resolver
// ============================================================

/**
 * Resolves the full dependency tree for a target item.
 *
 * @param graph - The recipe graph from blueprint-loader
 * @param targetTypeId - The item to build
 * @param targetQuantity - How many to build
 * @returns The root node of the resolved dependency tree
 */
export function resolveRecipeTree(
  graph: RecipeGraph,
  targetTypeId: number,
  targetQuantity: number,
): ResolvedNode {
  const visited = new Set<number>();
  return resolveNode(graph, targetTypeId, targetQuantity, visited);
}

function resolveNode(
  graph: RecipeGraph,
  typeId: number,
  quantityNeeded: number,
  visited: Set<number>,
): ResolvedNode {
  const name = typeName(graph, typeId);
  const recipe = graph.recipesByOutput.get(typeId);

  // Leaf material: no recipe exists, or cycle detected
  if (!recipe || visited.has(typeId)) {
    return {
      typeId,
      name,
      quantityNeeded,
      runs: 0,
      quantityPerRun: 0,
      isCraftable: false,
      children: [],
    };
  }

  // Compute runs needed (ceiling division)
  const runs = Math.ceil(quantityNeeded / recipe.outputQuantity);

  // Mark as visited to prevent cycles
  visited.add(typeId);

  // Recursively resolve each input
  const children: ResolvedNode[] = recipe.inputs.map((input) => {
    const inputQuantityNeeded = input.quantity * runs;
    return resolveNode(graph, input.typeId, inputQuantityNeeded, visited);
  });

  // Unmark (allows the same item to appear in different branches)
  visited.delete(typeId);

  return {
    typeId,
    name,
    quantityNeeded,
    runs,
    quantityPerRun: recipe.outputQuantity,
    isCraftable: true,
    children,
  };
}

/**
 * Flattens the dependency tree into a list of leaf materials (raw resources).
 * Aggregates quantities across all branches.
 */
export function collectLeafMaterials(root: ResolvedNode): LeafMaterial[] {
  const acc = new Map<number, LeafMaterial>();
  collectLeaves(root, acc);
  return Array.from(acc.values()).sort((a, b) => b.quantity - a.quantity);
}

function collectLeaves(
  node: ResolvedNode,
  acc: Map<number, LeafMaterial>,
): void {
  if (!node.isCraftable) {
    // Leaf material — aggregate
    const existing = acc.get(node.typeId);
    if (existing) {
      existing.quantity += node.quantityNeeded;
    } else {
      acc.set(node.typeId, {
        typeId: node.typeId,
        name: node.name,
        quantity: node.quantityNeeded,
      });
    }
    return;
  }

  for (const child of node.children) {
    collectLeaves(child, acc);
  }
}

/**
 * Prints a human-readable dependency tree to console.
 */
export function printTree(node: ResolvedNode, indent: number = 0): void {
  const prefix = "  ".repeat(indent);
  const craftInfo = node.isCraftable
    ? ` (${node.runs} run${node.runs > 1 ? "s" : ""} × ${node.quantityPerRun}/run)`
    : " [RAW]";
  console.log(`${prefix}${node.name} ×${node.quantityNeeded}${craftInfo}`);
  for (const child of node.children) {
    printTree(child, indent + 1);
  }
}
