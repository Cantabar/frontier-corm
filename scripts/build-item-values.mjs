#!/usr/bin/env node
/**
 * build-item-values.mjs
 *
 * Computes a baseline LUX value for every item based on time-to-produce.
 *
 * Two anchor correlations:
 *   1. LUX ↔ Time:  ~100,000 LUX per hour  →  ~27.78 LUX/second
 *   2. Ore ↔ Time:  Small Cutting Laser mines 26 m³ per 4s cycle
 *                    → 6.5 ore units/second (all ores are 1 m³/unit)
 *
 * For each item the script recursively walks the blueprint tree to sum
 * total mining time + craft time, then converts to LUX.
 *
 * Usage:  node scripts/build-item-values.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ── Load source data ──────────────────────────────────────────────

const items = loadJson(resolve(ROOT, "web/public/items.json"));
const blueprints = loadJson(resolve(ROOT, "web/public/blueprints.json"));

// ── Constants ─────────────────────────────────────────────────────

// LUX income assumption
const LUX_PER_HOUR = 100_000;
const LUX_PER_SECOND = LUX_PER_HOUR / 3600;

// Small Cutting Laser (typeId 77852) dogma attributes:
//   attr 73 (cycle time)   = 4000 ms  → 4 s
//   attr 77 (mining amount) = 26 m³ per cycle
const MINING_CYCLE_SECONDS = 4;
const MINING_VOLUME_PER_CYCLE = 26; // m³
const ORE_VOLUME = 1.0; // all asteroid ores are 1 m³/unit

const ORE_PER_SECOND = MINING_VOLUME_PER_CYCLE / MINING_CYCLE_SECONDS; // 6.5 units/s

// ── Item & blueprint lookups ──────────────────────────────────────

const itemMap = new Map(); // typeId → item
for (const item of items) {
  itemMap.set(item.typeId, item);
}

// Facility tier ordering — prefer the most accessible (smallest) facility
const FACILITY_TIER = {
  "Field Refinery": 0,
  "Field Printer": 0,
  "Field Storage": 0,
  "Mini Printer": 1,
  "Mini Berth": 1,
  Refinery: 2,
  Printer: 2,
  Berth: 2,
  Assembler: 2,
  Nursery: 2,
  "Heavy Refinery": 3,
  "Heavy Printer": 3,
  "Heavy Berth": 3,
  Refuge: 4,
};

function facilityTier(bp) {
  if (!bp.facilities || bp.facilities.length === 0) return 99;
  return Math.min(
    ...bp.facilities.map((f) => FACILITY_TIER[f.facilityName] ?? 50)
  );
}

// Build reverse lookup: typeId → blueprints that produce it (as an output)
const producedBy = new Map(); // typeId → blueprint[]

for (const bp of blueprints) {
  for (const out of bp.outputs) {
    if (!producedBy.has(out.typeId)) {
      producedBy.set(out.typeId, []);
    }
    producedBy.get(out.typeId).push(bp);
  }
}

// For each typeId, rank all blueprints that produce it (lowest facility tier first)
const rankedBlueprintsFor = new Map(); // typeId → [{ bp, outputEntry }]

for (const [typeId, bpList] of producedBy.entries()) {
  const sorted = [...bpList].sort((a, b) => {
    const tierDiff = facilityTier(a) - facilityTier(b);
    if (tierDiff !== 0) return tierDiff;
    return a.runTime - b.runTime;
  });

  rankedBlueprintsFor.set(
    typeId,
    sorted.map((bp) => ({
      bp,
      outputEntry: bp.outputs.find((o) => o.typeId === typeId),
    }))
  );
}

// ── Recursive valuation ───────────────────────────────────────────

// Memoization: typeId → { miningTime, craftTime } (seconds to produce 1 unit)
const memo = new Map();
const resolving = new Set(); // cycle detection

/**
 * Attempts to resolve a single blueprint for typeId.
 * Returns { miningTime, craftTime } or null if inputs can't resolve.
 */
function tryBlueprint(typeId, bp, outputEntry) {
  let totalInputMiningTime = 0;
  let totalInputCraftTime = 0;

  for (const input of bp.inputs) {
    const inputTime = resolveTime(input.typeId);
    if (inputTime === null) return null;
    totalInputMiningTime += inputTime.miningTime * input.quantity;
    totalInputCraftTime += inputTime.craftTime * input.quantity;
  }

  // Blueprint craft time — split across outputs proportionally by volume
  const totalOutputVolume = bp.outputs.reduce((sum, o) => {
    const outItem = itemMap.get(o.typeId);
    return sum + (outItem ? outItem.volume : 1) * o.quantity;
  }, 0);

  const thisOutputVolume =
    ((itemMap.get(typeId)?.volume) ?? 1) * outputEntry.quantity;
  const volumeFraction =
    totalOutputVolume > 0 ? thisOutputVolume / totalOutputVolume : 1;

  const bpCraftTimeShare = bp.runTime * volumeFraction;
  const perUnitMiningTime = (totalInputMiningTime * volumeFraction) / outputEntry.quantity;
  const perUnitCraftTime =
    (totalInputCraftTime * volumeFraction + bpCraftTimeShare) / outputEntry.quantity;

  return { miningTime: perUnitMiningTime, craftTime: perUnitCraftTime };
}

/**
 * Returns { miningTime, craftTime } in seconds to produce 1 unit of typeId.
 * Tries ranked blueprints in order, falling back when inputs can't resolve.
 * Returns null if no production path exists.
 */
function resolveTime(typeId) {
  if (memo.has(typeId)) return memo.get(typeId);

  const item = itemMap.get(typeId);

  // Raw ores — value comes purely from mining time
  if (item && item.categoryName === "Asteroid") {
    const miningTime = ORE_VOLUME / ORE_PER_SECOND; // seconds per 1 ore unit
    const result = { miningTime, craftTime: 0 };
    memo.set(typeId, result);
    return result;
  }

  // No blueprint to produce this item
  if (!rankedBlueprintsFor.has(typeId)) {
    memo.set(typeId, null);
    return null;
  }

  // Cycle detection
  if (resolving.has(typeId)) {
    return null; // don't memo — let caller try next blueprint
  }
  resolving.add(typeId);

  // Try each ranked blueprint until one resolves
  let result = null;
  for (const { bp, outputEntry } of rankedBlueprintsFor.get(typeId)) {
    result = tryBlueprint(typeId, bp, outputEntry);
    if (result !== null) break;
  }

  resolving.delete(typeId);
  memo.set(typeId, result);
  return result;
}

// ── Compute values for all items ──────────────────────────────────

const results = [];

for (const item of items) {
  const time = resolveTime(item.typeId);

  if (time === null) {
    results.push({
      typeId: item.typeId,
      name: item.name,
      categoryName: item.categoryName,
      luxValue: null,
      timeSeconds: null,
      source: "unknown",
      breakdown: null,
    });
    continue;
  }

  const totalTime = time.miningTime + time.craftTime;
  const luxValue = totalTime * LUX_PER_SECOND;

  let source;
  if (item.categoryName === "Asteroid") {
    source = "mining";
  } else if (time.craftTime > 0) {
    source = "crafted";
  } else {
    source = "mining";
  }

  results.push({
    typeId: item.typeId,
    name: item.name,
    categoryName: item.categoryName,
    luxValue: Math.round(luxValue * 100) / 100,
    timeSeconds: Math.round(totalTime * 1000) / 1000,
    source,
    breakdown: {
      miningTime: Math.round(time.miningTime * 1000) / 1000,
      craftTime: Math.round(time.craftTime * 1000) / 1000,
    },
  });
}

// Sort by typeId for stable output
results.sort((a, b) => a.typeId - b.typeId);

// ── Write output ──────────────────────────────────────────────────

const dest = resolve(ROOT, "web/public/item-values.json");
writeFileSync(dest, JSON.stringify(results, null, 2) + "\n");

// ── Summary ───────────────────────────────────────────────────────

const valued = results.filter((r) => r.luxValue !== null);
const unknown = results.filter((r) => r.luxValue === null);
const mining = valued.filter((r) => r.source === "mining");
const crafted = valued.filter((r) => r.source === "crafted");

console.log(`  ✓ ${dest.replace(ROOT + "/", "")} (${results.length} items)`);
console.log(`    ${valued.length} valued, ${unknown.length} unknown`);
console.log(
  `    ${mining.length} mining, ${crafted.length} crafted`
);

if (valued.length > 0) {
  const luxValues = valued.map((r) => r.luxValue);
  console.log(
    `    LUX range: ${Math.min(...luxValues).toLocaleString()} – ${Math.max(...luxValues).toLocaleString()}`
  );
}

if (unknown.length > 0) {
  console.log(`    Unknown items:`);
  for (const u of unknown) {
    console.log(`      - ${u.name} (${u.typeId}) [${u.categoryName}]`);
  }
}
