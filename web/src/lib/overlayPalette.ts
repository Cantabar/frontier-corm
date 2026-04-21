import * as THREE from 'three';
import { REGION_ADJACENCY, CONSTELLATION_ADJACENCY } from './overlayData';
import { SOLAR_SYSTEMS } from './solarSystems';

// ── Base palette ──────────────────────────────────────────────────────────────

const PALETTE: THREE.Color[] = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
  '#d37295',
  '#499894',
].map(hex => new THREE.Color(hex));

// ── assignCategoricalColors ───────────────────────────────────────────────────

/**
 * Greedy graph colouring over the adjacency graph.
 * Processes category IDs in ascending numeric order.
 * Cycles palette when all colours are used by neighbours.
 */
export function assignCategoricalColors(
  categoryIds: number[],
  adjacency: Map<number, number[]>,
): Map<number, THREE.Color> {
  const result = new Map<number, THREE.Color>();
  if (categoryIds.length === 0) return result;

  const sorted = [...categoryIds].sort((a, b) => a - b);

  for (const id of sorted) {
    const neighbours = adjacency.get(id) ?? [];
    const usedHex = new Set<number>();
    for (const neighbourId of neighbours) {
      const neighbourColor = result.get(neighbourId);
      if (neighbourColor !== undefined) {
        usedHex.add(neighbourColor.getHex());
      }
    }

    // Find the lowest-index palette colour not used by any neighbour
    let chosen: THREE.Color | undefined;
    for (let i = 0; i < PALETTE.length; i++) {
      if (!usedHex.has(PALETTE[i].getHex())) {
        chosen = PALETTE[i];
        break;
      }
    }

    // If all palette colours are used by neighbours, cycle
    if (chosen === undefined) {
      const paletteIndex = sorted.indexOf(id) % PALETTE.length;
      chosen = PALETTE[paletteIndex];
    }

    result.set(id, chosen.clone());
  }

  return result;
}

// ── gradientColor ─────────────────────────────────────────────────────────────

/**
 * Returns a new THREE.Color linearly interpolated between `from` (at min) and
 * `to` (at max). Clamps value to [min, max]. Does NOT mutate from or to.
 */
export function gradientColor(
  value: number,
  min: number,
  max: number,
  from: THREE.Color,
  to: THREE.Color,
): THREE.Color {
  if (min === max) return from.clone();
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const result = new THREE.Color();
  result.lerpColors(from, to, t);
  return result;
}

// ── Module-level constants ────────────────────────────────────────────────────

const regionIds = [...new Set([...SOLAR_SYSTEMS.values()].map(s => s.regionId))];
const constIds = [...new Set([...SOLAR_SYSTEMS.values()].map(s => s.constellationId))];

export const REGION_COLOR_MAP: Map<number, THREE.Color> = assignCategoricalColors(
  regionIds,
  REGION_ADJACENCY,
);

export const CONSTELLATION_COLOR_MAP: Map<number, THREE.Color> = assignCategoricalColors(
  constIds,
  CONSTELLATION_ADJACENCY,
);

export const ANCIENT_CIV_COLORS: {
  500074: THREE.Color;
  500075: THREE.Color;
  500078: THREE.Color;
  unclaimed: THREE.Color;
} = {
  500074: new THREE.Color('#e15759'), // Amarr Empire — red
  500075: new THREE.Color('#4e79a7'), // Caldari State — blue
  500078: new THREE.Color('#59a14f'), // Minmatar Republic — green
  unclaimed: new THREE.Color('#3a3a4a'), // dark neutral
};

export const ACCENT_COLOR: THREE.Color = new THREE.Color('#edc948');   // bright gold accent
export const DIM_COLOR: THREE.Color = new THREE.Color('#1a1a2e');      // dark navy neutral
export const GRADIENT_FROM: THREE.Color = new THREE.Color('#1a1a3e'); // dark end
export const GRADIENT_TO: THREE.Color = new THREE.Color('#f28e2b');   // bright orange end
