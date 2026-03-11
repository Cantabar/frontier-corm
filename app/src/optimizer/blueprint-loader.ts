/**
 * Blueprint Loader — reads EVE Frontier static data and builds an in-memory recipe graph.
 *
 * Data sources:
 *   - industry_blueprints.json: blueprint_id → { inputs[], outputs[], primaryTypeID, runTime }
 *   - types.json: typeID → { typeName, groupID, ... }
 *
 * The loader builds two indexes:
 *   1. recipesByOutput: output typeID → Recipe (for forward lookups: "how do I build X?")
 *   2. typeNames: typeID → human-readable name
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================
// Types
// ============================================================

export interface InputMaterial {
  typeId: number;
  quantity: number;
}

export interface Recipe {
  blueprintId: string;
  outputTypeId: number;
  outputQuantity: number;
  inputs: InputMaterial[];
  runTime: number;
}

export interface RecipeGraph {
  /** output typeID → Recipe */
  recipesByOutput: Map<number, Recipe>;
  /** typeID → human-readable name */
  typeNames: Map<number, string>;
  /** All recipes indexed by blueprint ID */
  blueprints: Map<string, Recipe>;
}

// ============================================================
// Raw JSON shapes
// ============================================================

interface RawBlueprint {
  inputs: { quantity: number; typeID: number }[];
  outputs: { quantity: number; typeID: number }[];
  primaryTypeID: number;
  runTime: number;
}

interface RawType {
  typeID: number;
  typeName: string;
  groupID: number;
  [key: string]: unknown;
}

// ============================================================
// Loader
// ============================================================

const DEFAULT_DATA_DIR = resolve(
  import.meta.dirname ?? ".",
  "../../../static-data/data/phobos/fsd_built",
);

export function loadRecipeGraph(dataDir: string = DEFAULT_DATA_DIR): RecipeGraph {
  const blueprintsPath = resolve(dataDir, "industry_blueprints.json");
  const typesPath = resolve(dataDir, "types.json");

  const rawBlueprints: Record<string, RawBlueprint> = JSON.parse(
    readFileSync(blueprintsPath, "utf-8"),
  );
  const rawTypes: Record<string, RawType> = JSON.parse(
    readFileSync(typesPath, "utf-8"),
  );

  // Build type name index
  const typeNames = new Map<number, string>();
  for (const [, typeData] of Object.entries(rawTypes)) {
    typeNames.set(typeData.typeID, typeData.typeName);
  }

  // Build recipe indexes
  const recipesByOutput = new Map<number, Recipe>();
  const blueprints = new Map<string, Recipe>();

  for (const [bpId, bp] of Object.entries(rawBlueprints)) {
    const recipe: Recipe = {
      blueprintId: bpId,
      outputTypeId: bp.primaryTypeID,
      outputQuantity: bp.outputs[0]?.quantity ?? 1,
      inputs: bp.inputs.map((i) => ({ typeId: i.typeID, quantity: i.quantity })),
      runTime: bp.runTime,
    };

    blueprints.set(bpId, recipe);

    // Index by output type — if multiple blueprints produce the same output,
    // keep the first one (simplification for hackathon scope)
    if (!recipesByOutput.has(recipe.outputTypeId)) {
      recipesByOutput.set(recipe.outputTypeId, recipe);
    }
  }

  console.log(
    `Loaded ${blueprints.size} blueprints, ${typeNames.size} types, ${recipesByOutput.size} craftable outputs`,
  );

  return { recipesByOutput, typeNames, blueprints };
}

/** Resolve a typeID to its human-readable name, or "Unknown (typeID)" as fallback. */
export function typeName(graph: RecipeGraph, typeId: number): string {
  return graph.typeNames.get(typeId) ?? `Unknown (${typeId})`;
}
