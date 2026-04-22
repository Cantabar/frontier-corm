#!/usr/bin/env node
/**
 * build-overlay-data.mjs
 *
 * Reads static-data source files and emits web/src/data/overlay-data.json
 * with pre-processed map overlay data for the React frontend.
 *
 * Output format:
 *   {
 *     "systems": [[sysId, factionId_or_null, totalPlanets, planetTypeBitmask, moonCount, hasNpcStation], ...],
 *     "regionAdj": [[r1, r2], ...],
 *     "constAdj": [[c1, c2], ...]
 *   }
 *
 * Note: regionAdj is derived from k-NN over solar system positions (from
 * web/src/data/solar-systems.json), not from jumps — Eve Frontier has no inter-region jumps.
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

/**
 * Build region adjacency from solar system positions using k-nearest-neighbors.
 *
 * Two regions are considered adjacent iff a star from each sits among its
 * cross-region k-nearest neighbors in 3D space.
 *
 * @param {Array} solarSystems - web/src/data/solar-systems.json rows
 *   [sysId, name, constellationId, regionId, xStr, yStr, zStr]
 * @returns {Set<string>} set of "a,b" keys with a<b for region pairs
 */
function buildRegionAdjacencyFromStars(solarSystems) {
  const LY_METERS = 9.4607e15;
  const CELL_SIZE_LY = 50;
  const K = 6;
  const MAX_SHELL_RADIUS = 5;

  const N = solarSystems.length;
  const xs = new Float64Array(N);
  const ys = new Float64Array(N);
  const zs = new Float64Array(N);
  const regions = new Int32Array(N);

  for (let i = 0; i < N; i++) {
    const s = solarSystems[i];
    xs[i] = Number(BigInt(s[4])) / LY_METERS;
    ys[i] = Number(BigInt(s[5])) / LY_METERS;
    zs[i] = Number(BigInt(s[6])) / LY_METERS;
    regions[i] = s[3];
  }

  // Uniform 3D grid index: "cx,cy,cz" -> int[] of star indices
  const grid = new Map();
  const cellOf = (v) => Math.floor(v / CELL_SIZE_LY);
  const cxs = new Int32Array(N);
  const cys = new Int32Array(N);
  const czs = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const cx = cellOf(xs[i]);
    const cy = cellOf(ys[i]);
    const cz = cellOf(zs[i]);
    cxs[i] = cx;
    cys[i] = cy;
    czs[i] = cz;
    const key = `${cx},${cy},${cz}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  const regionAdjSet = new Set();

  // Scratch buffer for candidate indices, reused per star
  const candidates = [];

  for (let i = 0; i < N; i++) {
    const cx = cxs[i];
    const cy = cys[i];
    const cz = czs[i];

    candidates.length = 0;

    // Shell-expanding search: r=0 covers the home cell only, r=1 adds the
    // surrounding 3x3x3 shell, etc. We only scan new cells per shell.
    for (let r = 0; r <= MAX_SHELL_RADIUS; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            const maxAbs = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
            if (maxAbs !== r) continue; // only the outer shell at this radius
            const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (!bucket) continue;
            for (let k = 0; k < bucket.length; k++) {
              candidates.push(bucket[k]);
            }
          }
        }
      }
      if (candidates.length >= K + 1) break;
    }

    if (candidates.length < K + 1) {
      console.warn(
        `  WARN: star sysId=${solarSystems[i][0]} found only ${candidates.length - 1} neighbor(s) within r=${MAX_SHELL_RADIUS} shells`
      );
    }

    // Score candidates by squared distance, drop self
    const scored = [];
    const xi = xs[i], yi = ys[i], zi = zs[i];
    for (let c = 0; c < candidates.length; c++) {
      const j = candidates[c];
      if (j === i) continue;
      const ddx = xs[j] - xi;
      const ddy = ys[j] - yi;
      const ddz = zs[j] - zi;
      scored.push([ddx * ddx + ddy * ddy + ddz * ddz, j]);
    }
    scored.sort((a, b) => a[0] - b[0]);

    const take = Math.min(K, scored.length);
    const ri = regions[i];
    for (let n = 0; n < take; n++) {
      const j = scored[n][1];
      const rj = regions[j];
      if (ri === rj) continue;
      const key = ri < rj ? `${ri},${rj}` : `${rj},${ri}`;
      regionAdjSet.add(key);
    }
  }

  // Fallback for isolated regions: any region with zero cross-region neighbors
  // gets its closest foreign star attached.
  const universeRegions = new Set();
  for (let i = 0; i < N; i++) universeRegions.add(regions[i]);

  const touched = new Set();
  for (const k of regionAdjSet) {
    const [a, b] = k.split(",").map(Number);
    touched.add(a);
    touched.add(b);
  }

  // Index first-seen star per region for fallback lookup
  const regionFirstStar = new Map();
  for (let i = 0; i < N; i++) {
    if (!regionFirstStar.has(regions[i])) regionFirstStar.set(regions[i], i);
  }

  let fallbacks = 0;
  for (const regionId of universeRegions) {
    if (touched.has(regionId)) continue;
    const i = regionFirstStar.get(regionId);
    if (i === undefined) continue;

    // Brute-force: find this star's closest foreign-region star globally.
    let bestJ = -1;
    let bestD2 = Infinity;
    const xi = xs[i], yi = ys[i], zi = zs[i];
    for (let j = 0; j < N; j++) {
      if (regions[j] === regionId) continue;
      const ddx = xs[j] - xi;
      const ddy = ys[j] - yi;
      const ddz = zs[j] - zi;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestJ = j;
      }
    }
    if (bestJ === -1) continue;
    const rj = regions[bestJ];
    const key = regionId < rj ? `${regionId},${rj}` : `${rj},${regionId}`;
    if (!regionAdjSet.has(key)) {
      regionAdjSet.add(key);
      fallbacks++;
    }
  }

  // Stats logging
  const degreeMap = new Map();
  for (const k of regionAdjSet) {
    const [a, b] = k.split(",").map(Number);
    if (!degreeMap.has(a)) degreeMap.set(a, new Set());
    if (!degreeMap.has(b)) degreeMap.set(b, new Set());
    degreeMap.get(a).add(b);
    degreeMap.get(b).add(a);
  }
  const degrees = [];
  let maxDeg = 0;
  let maxDegRegion = -1;
  for (const [rid, nset] of degreeMap) {
    const d = nset.size;
    degrees.push(d);
    if (d > maxDeg) {
      maxDeg = d;
      maxDegRegion = rid;
    }
  }
  degrees.sort((a, b) => a - b);
  const median = degrees.length === 0
    ? 0
    : degrees.length % 2 === 1
      ? degrees[(degrees.length - 1) >> 1]
      : (degrees[degrees.length / 2 - 1] + degrees[degrees.length / 2]) / 2;

  console.log("\n  Region adjacency (star k-NN):");
  console.log(`    pairs: ${regionAdjSet.size}`);
  console.log(`    regions with ≥1 neighbor: ${degreeMap.size} / ${universeRegions.size}`);
  console.log(`    max degree: ${maxDeg} (region ${maxDegRegion})`);
  console.log(`    median degree: ${median}`);
  console.log(`    fallback additions: ${fallbacks}`);

  return regionAdjSet;
}

function main() {
  console.log("Building overlay data from static sources...\n");

  console.log("  Reading starmapcache...");
  const starmapcache = requireFile(STARMAPCACHE_PATH);

  console.log("  Reading celestials...");
  const celestials = requireFile(CELESTIALS_PATH);

  console.log("  Reading npcStations...");
  const npcStations = requireFile(NPC_STATIONS_PATH);

  console.log("  Reading solar-systems (for validation and region adjacency)...\n");
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

  // Build constellation adjacency pairs from jumps.
  // Region adjacency is built separately from star k-NN — Eve Frontier has no inter-region jumps.
  const constAdjSet = new Set();

  for (const jump of jumps) {
    const fromSys = cacheSystemsMap[String(jump.fromSystemID)];
    const toSys = cacheSystemsMap[String(jump.toSystemID)];
    if (!fromSys || !toSys) continue;

    const cFrom = fromSys.constellationID;
    const cTo = toSys.constellationID;
    if (cFrom !== cTo) {
      const key = cFrom < cTo ? `${cFrom},${cTo}` : `${cTo},${cFrom}`;
      constAdjSet.add(key);
    }
  }

  // Region adjacency from k-NN over solar system positions.
  const regionAdjSet = buildRegionAdjacencyFromStars(webSolarSystems);

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
