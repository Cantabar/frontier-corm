import { useEffect, useState, useMemo } from "react";
import type { RecipeData } from "../lib/types";
import type { CraftingStyle } from "./useCraftingStyle";

/* ── Salvage classification ──────────────────────────────────── */

/** Known salvage-category input typeIds (Salvaged Materials, Mummified Clone). */
export const SALVAGE_INPUT_TYPE_IDS = new Set([88764, 88765]);

/** True when any of a blueprint's inputs are salvage items. */
export function isSalvageBlueprint(bp: BlueprintEntry): boolean {
  return bp.inputs.some((i) => SALVAGE_INPUT_TYPE_IDS.has(i.typeId));
}

/** True when any of a recipe's inputs are salvage items. */
export function isSalvageRecipe(recipe: RecipeData): boolean {
  return recipe.inputs.some((i) => SALVAGE_INPUT_TYPE_IDS.has(i.typeId));
}

/* ── Field / Base facility classification ────────────────────── */

const FIELD_FACILITY_NAMES = new Set(["Field Refinery", "Field Printer"]);

/** True when the facility name is a field-class facility. */
export function isFieldFacility(facilityName: string): boolean {
  return FIELD_FACILITY_NAMES.has(facilityName);
}

/** True when a BlueprintRecipe uses a field-class facility. */
export function isFieldRecipe(recipe: BlueprintRecipe): boolean {
  return isFieldFacility(recipe.facilityName);
}

export interface BlueprintOutput {
  typeId: number;
  quantity: number;
}

export interface BlueprintInput {
  typeId: number;
  quantity: number;
}

export interface BlueprintFacility {
  facilityTypeId: number;
  facilityName: string;
  facilityFamily: string;
}

export interface BlueprintEntry {
  blueprintId: number;
  primaryTypeId: number;
  primaryName: string;
  primaryIcon: string | null;
  primaryCategoryName: string | null;
  primaryGroupName: string | null;
  primaryMetaGroupName: string | null;
  slotType: "high" | "mid" | "low" | "engine" | null;
  sizeClass: "small" | "medium" | "large" | null;
  runTime: number;
  outputs: BlueprintOutput[];
  inputs: BlueprintInput[];
  facilities: BlueprintFacility[];
}

/** RecipeData enriched with blueprint and facility metadata. */
export interface BlueprintRecipe extends RecipeData {
  blueprintId: number;
  facilityName: string;
  facilityFamily: string;
}

let cache: BlueprintEntry[] | null = null;
let cachePromise: Promise<BlueprintEntry[]> | null = null;

function fetchBlueprints(): Promise<BlueprintEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!cachePromise) {
    cachePromise = fetch("/blueprints.json")
      .then((r) => r.json())
      .then((data: BlueprintEntry[]) => {
        cache = data;
        return data;
      });
  }
  return cachePromise;
}

export function useBlueprints(craftingStyle: CraftingStyle = "field") {
  const [blueprints, setBlueprints] = useState<BlueprintEntry[]>(cache ?? []);

  useEffect(() => {
    if (cache) {
      setBlueprints(cache);
      return;
    }
    fetchBlueprints().then(setBlueprints);
  }, []);

  function getBlueprint(blueprintId: number): BlueprintEntry | undefined {
    return blueprints.find((b) => b.blueprintId === blueprintId);
  }

  /**
   * Convert blueprints into RecipeData[] for the optimizer.
   * When multiple blueprints produce the same output, only the first is kept
   * (matching the game behaviour where the player selects a specific recipe).
   *
   * Ore-based recipes are preferred over salvage-input recipes: we pre-sort so
   * non-salvage blueprints appear before salvage ones, ensuring the first-wins
   * dedup picks an ore-based recipe when one exists.
   */
  const recipesForOptimizer = useMemo<RecipeData[]>(() => {
    const sorted = [...blueprints].sort((a, b) => {
      const aS = isSalvageBlueprint(a) ? 1 : 0;
      const bS = isSalvageBlueprint(b) ? 1 : 0;
      return aS - bS;
    });

    const seen = new Set<number>();
    const recipes: RecipeData[] = [];

    for (const bp of sorted) {
      const outputTypeId = bp.outputs[0]?.typeId;
      if (outputTypeId == null || seen.has(outputTypeId)) continue;
      seen.add(outputTypeId);

      const secondaryOutputs = bp.outputs.length > 1
        ? bp.outputs.slice(1).map((o) => ({ typeId: o.typeId, quantity: o.quantity }))
        : undefined;

      recipes.push({
        outputTypeId,
        outputQuantity: bp.outputs[0].quantity,
        secondaryOutputs,
        inputs: bp.inputs.map((i) => ({ typeId: i.typeId, quantity: i.quantity })),
        runTime: bp.runTime,
      });
    }

    return recipes;
  }, [blueprints]);

  /**
   * All blueprints grouped by output typeId, preserving every alternative.
   * Used by the optimizer to let the player pick a specific blueprint/facility
   * at each node in the dependency tree.
   *
   * Alternatives are sorted by:
   *   1. Crafting style preference (field-first or base-first)
   *   2. Ore-based (non-salvage) recipes before salvage-input recipes
   * This ensures the default selection (`alternatives[0]`) matches the
   * player's preferred crafting route.
   */
  const allRecipesMap = useMemo<Map<number, BlueprintRecipe[]>>(() => {
    const map = new Map<number, BlueprintRecipe[]>();

    for (const bp of blueprints) {
      const outputTypeId = bp.outputs[0]?.typeId;
      if (outputTypeId == null) continue;

      const secondaryOutputs = bp.outputs.length > 1
        ? bp.outputs.slice(1).map((o) => ({ typeId: o.typeId, quantity: o.quantity }))
        : undefined;

      const recipe: BlueprintRecipe = {
        outputTypeId,
        outputQuantity: bp.outputs[0].quantity,
        secondaryOutputs,
        inputs: bp.inputs.map((i) => ({ typeId: i.typeId, quantity: i.quantity })),
        runTime: bp.runTime,
        blueprintId: bp.blueprintId,
        facilityName: bp.facilities[0]?.facilityName ?? "Unknown",
        facilityFamily: bp.facilities[0]?.facilityFamily ?? "Unknown",
      };

      const existing = map.get(outputTypeId);
      if (existing) existing.push(recipe);
      else map.set(outputTypeId, [recipe]);
    }

    // Sort each output's alternatives:
    //   Primary: crafting style (field-first or base-first)
    //   Secondary: non-salvage before salvage
    const preferField = craftingStyle === "field";
    for (const [, recipes] of map) {
      if (recipes.length > 1) {
        recipes.sort((a, b) => {
          // Field/base preference (only meaningful when one is field and the other isn't)
          const aF = isFieldRecipe(a) ? 1 : 0;
          const bF = isFieldRecipe(b) ? 1 : 0;
          if (aF !== bF) return preferField ? bF - aF : aF - bF;
          // Salvage tiebreak
          const aS = isSalvageRecipe(a) ? 1 : 0;
          const bS = isSalvageRecipe(b) ? 1 : 0;
          return aS - bS;
        });
      }
    }

    return map;
  }, [blueprints, craftingStyle]);

  return { blueprints, getBlueprint, recipesForOptimizer, allRecipesMap };
}
