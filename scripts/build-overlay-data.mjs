#!/usr/bin/env node
/**
 * build-overlay-data.mjs
 *
 * Reads three static-data source files and emits web/src/data/overlay-data.json
 * with pre-processed map overlay data for the React frontend.
 *
 * Output format:
 *   {
 *     "systems": [[sysId, factionId_or_null, totalPlanets, planetTypeBitmask, moonCount, hasNpcStation], ...],
 *     "regionAdj": [[r1, r2], ...],
 *     "constAdj": [[c1, c2], ...]
 *   }
 *
 * Usage:  node scripts/build-overlay-data.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const STARMAPCACHE_PATH = resolve(ROOT, "static-data/data/phobos/resource_pickle/res__staticdata_starmapcache.json");
const CELESTIALS_PATH = resolve(ROOT, "static-data/data/phobos/sqlite/app__bin64_staticdata_mapObjects_celestials.json");
const NPC_STATIONS_PATH = resolve(ROOT, "static-data/data/phobos/sqlite/app__bin64_staticdata_mapObjects_npcStations.json");
const SOLAR_SYSTEMS_PATH = resolve(ROOT, "web/src/data/solar-systems.json");
const OUTPUT_PATH = resolve(ROOT, "web/src/data/overlay-data.json");

// Planet type bitmask positions
// bit 0 -> typeID 11 (Temperate)
// bit 1 -> typeID 12 (Ice)
// bit 2 -> typeID 13 (Gas)
// bit 3 -> typeID 2014 (Oceanic)
// bit 4 -> typeID 2015 (Lava)
// bit 5 -> typeID 2016 (Barren)
// bit 6 -> typeID 2063 (Plasma)
const PLANET_TYPE_BITS = {
  11: 0,
  12: 1,
  13: 2,
  2014: 3,
  2015: 4,
  2016: 5,
  2063: 6,
};

function requireFile(path) {
  if (!existsSync(path)) {
    console.error(`ERROR: Source file not found: ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  console.log("Building overlay data from static sources...\n");

  console.log("  Reading starmapcache...");
  const starmapcache = requireFile(STARMAPCACHE_PATH);

  console.log("  Reading celestials...");
  const celestials = requireFile(CELESTIALS_PATH);

  console.log("  Reading npcStations...");
  const npcStations = requireFile(NPC_STATIONS_PATH);

  console.log("  Reading solar-systems (for validation)...\n");
  const webSolarSystems = requireFile(SOLAR_SYSTEMS_PATH);

  const { solarSystems: cacheSystemsMap, jumps } = starmapcache;

  // Moon counts per solarSystemID (groupID=8)
  const moonCountMap = new Map();
  for (const cel of celestials) {
    if (cel.groupID === 8) {
      const sysId = cel.solarSystemID;
      moonCountMap.set(sysId, (moonCountMap.get(sysId) ?? 0) + 1);
    }
  }

  // NPC station presence per solarSystemID
  const npcStationSet = new Set();
  for (const station of npcStations) {
    npcStationSet.add(station.solarSystemID);
  }

  // Collect all unique system IDs from both cache and web solar-systems
  const allSysIds = new Set([
    ...Object.keys(cacheSystemsMap).map(Number),
    ...webSolarSystems.map((s) => s[0]),
  ]);

  const systems = [];
  for (const sysId of allSysIds) {
    const cacheEntry = cacheSystemsMap[String(sysId)];

    let factionId = null;
    let totalPlanets = 0;
    let planetTypeBitmask = 0;

    if (cacheEntry) {
      factionId = cacheEntry.factionID ?? null;

      const pct = cacheEntry.planetCountByType ?? {};
      for (const [typeIdStr, count] of Object.entries(pct)) {
        const typeId = Number(typeIdStr);
        totalPlanets += count;
        const bit = PLANET_TYPE_BITS[typeId];
        if (bit !== undefined) {
          planetTypeBitmask |= 1 << bit;
        }
      }
    }

    const moonCount = moonCountMap.get(sysId) ?? 0;
    const hasNpcStation = npcStationSet.has(sysId) ? 1 : 0;

    systems.push([sysId, factionId, totalPlanets, planetTypeBitmask, moonCount, hasNpcStation]);
  }

  // Sort ascending by sysId
  systems.sort((a, b) => a[0] - b[0]);

  // Build region and constellation adjacency pairs from jumps
  const regionAdjSet = new Set();
  const constAdjSet = new Set();

  for (const jump of jumps) {
    const fromSys = cacheSystemsMap[String(jump.fromSystemID)];
    const toSys = cacheSystemsMap[String(jump.toSystemID)];

    if (!fromSys || !toSys) continue;

    const rFrom = fromSys.regionID;
    const rTo = toSys.regionID;
    if (rFrom !== rTo) {
      const key = rFrom < rTo ? `${rFrom},${rTo}` : `${rTo},${rFrom}`;
      regionAdjSet.add(key);
    }

    const cFrom = fromSys.constellationID;
    const cTo = toSys.constellationID;
    if (cFrom !== cTo) {
      const key = cFrom < cTo ? `${cFrom},${cTo}` : `${cTo},${cFrom}`;
      constAdjSet.add(key);
    }
  }

  const regionAdj = [...regionAdjSet]
    .map((k) => k.split(",").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const constAdj = [...constAdjSet]
    .map((k) => k.split(",").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Write output
  const output = { systems, regionAdj, constAdj };
  const outputJson = JSON.stringify(output) + "\n";
  writeFileSync(OUTPUT_PATH, outputJson);

  const sizeKB = (Buffer.byteLength(outputJson) / 1024).toFixed(0);

  console.log(`  Systems processed: ${systems.length}`);
  console.log(`  Output size: ${sizeKB}KB`);
  console.log(`  regionAdj pairs: ${regionAdj.length}`);
  console.log(`  constAdj pairs: ${constAdj.length}`);

  // Validate: every sysId in solar-systems.json must appear in systems output
  const outputSysIds = new Set(systems.map((s) => s[0]));
  const webIds = webSolarSystems.map((s) => s[0]);
  const missing = webIds.filter((id) => !outputSysIds.has(id));

  if (missing.length > 0) {
    console.error(`\nERROR: ${missing.length} system IDs from solar-systems.json are missing from output:`);
    console.error("  ", missing.slice(0, 10).join(", "), missing.length > 10 ? "..." : "");
    process.exit(1);
  }

  console.log(`\n  OK Validation passed: all ${webIds.length} solar-systems.json IDs are present`);
  console.log(`  OK ${OUTPUT_PATH.replace(ROOT + "/", "")}`);
}

main();
