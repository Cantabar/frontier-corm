/**
 * Solar system reference data for the Shadow Location Network.
 *
 * Provides an in-memory lookup from solarSystemId → name + region,
 * and a substring search for the autocomplete picker.
 *
 * Data source: static JSON file bundled at build time.
 * For production, regenerate from the CCP SDE mapSolarSystems table or
 * the Stillness World API. The current file contains a representative
 * subset (~90 systems across Solitude + neighboring regions).
 */

import rawSystems from "../data/solar-systems.json";

// ============================================================
// Types
// ============================================================

export interface SolarSystemEntry {
  id: number;
  name: string;
  region: string;
}

// ============================================================
// Lookup structures (built once on first import)
// ============================================================

const systems: SolarSystemEntry[] = rawSystems as SolarSystemEntry[];

/** Map from solarSystemId → entry for O(1) lookups. */
const byId = new Map<number, SolarSystemEntry>();

/** Lowercased name+region pairs pre-computed for fast search. */
const searchIndex: { lower: string; entry: SolarSystemEntry }[] = [];

for (const entry of systems) {
  byId.set(entry.id, entry);
  searchIndex.push({
    lower: `${entry.name} ${entry.region}`.toLowerCase(),
    entry,
  });
}

// ============================================================
// Public API
// ============================================================

/** All loaded solar systems. */
export const SOLAR_SYSTEMS = byId;

/** Resolve a solar system ID to its name, or return a fallback string. */
export function solarSystemName(id: number): string {
  return byId.get(id)?.name ?? `System #${id}`;
}

/** Resolve a solar system ID to its region name, or return "Unknown". */
export function solarSystemRegion(id: number): string {
  return byId.get(id)?.region ?? "Unknown";
}

/**
 * Case-insensitive substring search across system names and regions.
 * Returns up to `limit` matching entries (default 15), prioritising
 * prefix matches over substring matches.
 */
export function searchSolarSystems(
  query: string,
  limit = 15,
): SolarSystemEntry[] {
  if (!query) return systems.slice(0, limit);

  const q = query.toLowerCase();
  const prefixMatches: SolarSystemEntry[] = [];
  const substringMatches: SolarSystemEntry[] = [];

  for (const { lower, entry } of searchIndex) {
    if (entry.name.toLowerCase().startsWith(q)) {
      prefixMatches.push(entry);
    } else if (lower.includes(q)) {
      substringMatches.push(entry);
    }
    if (prefixMatches.length + substringMatches.length >= limit * 2) break;
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}
