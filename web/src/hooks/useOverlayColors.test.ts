import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import * as THREE from "three";
import { useOverlayColors } from "./useOverlayColors";
import type { DecryptedPod } from "./useLocationPods";
import type { OverlayConfig } from "../lib/overlayTypes";

// ---------------------------------------------------------------------------
// Module mocks — keep these stable so individual tests can focus on behaviour
// ---------------------------------------------------------------------------

// vi.mock factory callbacks run after ES module imports are resolved, so
// THREE is available inside them (unlike vi.hoisted which runs before imports).

vi.mock("../lib/solarSystems", () => ({
  SOLAR_SYSTEMS: new Map([
    [1, { id: 1, name: "Alpha", regionId: 10, constellationId: 100, x: 0n, y: 0n, z: 0n }],
    [2, { id: 2, name: "Beta",  regionId: 20, constellationId: 100, x: 0n, y: 0n, z: 0n }],
    [3, { id: 3, name: "Gamma", regionId: 10, constellationId: 101, x: 0n, y: 0n, z: 0n }],
  ]),
}));

vi.mock("../lib/overlayData", () => ({
  SYSTEM_FACTION: new Map([[1, 500074], [2, null], [3, 500075]]),
  SYSTEM_PLANET_COUNT: new Map([[1, 5], [2, 0], [3, 12]]),
  SYSTEM_PLANET_BITMASK: new Map([[1, 0b0000001], [2, 0b0000000], [3, 0b0000010]]),
  SYSTEM_MOON_COUNT: new Map([[1, 3], [2, 0], [3, 20]]),
  SYSTEM_HAS_NPC_STATION: new Set([1]),
  PLANET_TYPES: [
    { typeId: 11, name: "Temperate", bit: 0 },
    { typeId: 12, name: "Ice",       bit: 1 },
  ],
  REGION_ADJACENCY: new Map<number, number[]>(),
  CONSTELLATION_ADJACENCY: new Map<number, number[]>(),
  MAX_PLANET_COUNT: 12,
  MAX_MOON_COUNT: 20,
}));

vi.mock("../lib/overlayPalette", () => ({
  REGION_COLOR_MAP: new Map([[10, new THREE.Color(1, 0, 0)], [20, new THREE.Color(0, 0, 1)]]),
  CONSTELLATION_COLOR_MAP: new Map([[100, new THREE.Color(0, 1, 0)], [101, new THREE.Color(1, 1, 0)]]),
  ANCIENT_CIV_COLORS: {
    500074: new THREE.Color(1, 0.5, 0),
    500075: new THREE.Color(0.5, 0, 1),
    500078: new THREE.Color(0, 1, 0.5),
    unclaimed: new THREE.Color(0.1, 0.1, 0.1),
  },
  ACCENT_COLOR: new THREE.Color(0, 0.8, 1),
  DIM_COLOR: new THREE.Color(0.15, 0.15, 0.15),
  GRADIENT_FROM: new THREE.Color(0.05, 0.05, 0.1),
  GRADIENT_TO: new THREE.Color(0, 0.6, 1),
  gradientColor: (value: number, min: number, max: number, from: THREE.Color, to: THREE.Color) => {
    const t = Math.max(0, Math.min(1, (max === min ? 0 : (value - min) / (max - min))));
    return new THREE.Color().lerpColors(from, to, t);
  },
  assignCategoricalColors: vi.fn(() => new Map<number, THREE.Color>()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDS = [1, 2, 3];

function makeConfig(
  filter: OverlayConfig["filter"],
  mode: OverlayConfig["mode"] = "color",
  extra?: Partial<OverlayConfig>,
): OverlayConfig {
  return { filter, mode, ...extra };
}

function colorAt(colors: Float32Array, idx: number): [number, number, number] {
  return [colors[idx * 3], colors[idx * 3 + 1], colors[idx * 3 + 2]];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useOverlayColors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── null config ────────────────────────────────────────────────────────────

  it("returns null for all outputs when overlayConfig is null", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: null, ids: IDS, pods: [] }),
    );
    expect(result.current.colors).toBeNull();
    expect(result.current.glowMask).toBeNull();
    expect(result.current.densityMask).toBeNull();
  });

  // ── Region filter ──────────────────────────────────────────────────────────

  it("Region filter: each system's RGB matches its region's assigned color", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("region"), ids: IDS, pods: [] }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);
    expect(colors!.length).toBe(IDS.length * 3);

    // system id=1 → regionId=10 → red (1, 0, 0)
    const [r0] = colorAt(colors!, 0);
    expect(r0).toBeCloseTo(1, 2);

    // system id=2 → regionId=20 → blue (0, 0, 1)
    const [, , b1] = colorAt(colors!, 1);
    expect(b1).toBeCloseTo(1, 2);

    // system id=3 → regionId=10 → same color as id=1
    expect(colorAt(colors!, 2)[0]).toBeCloseTo(colorAt(colors!, 0)[0], 2);
  });

  // ── Constellation filter ───────────────────────────────────────────────────

  it("Constellation filter: each system's RGB matches its constellation's assigned color", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("constellation"), ids: IDS, pods: [] }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    // systems 1 & 2 → constellationId=100 → green (0, 1, 0)
    expect(colorAt(colors!, 0)[1]).toBeCloseTo(1, 2);
    expect(colorAt(colors!, 1)[1]).toBeCloseTo(1, 2);

    // system 3 → constellationId=101 → different color (yellow, g=1 same as green — check blue channel differs)
    expect(colorAt(colors!, 2)[0]).toBeCloseTo(1, 2); // yellow has r=1, green has r=0
  });

  // ── Ancient Civilizations filter ───────────────────────────────────────────

  it("Ancient Civilizations: faction systems get their faction color; null-faction systems get unclaimed color", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("ancientCivilizations"), ids: IDS, pods: [] }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    // id=1 → faction 500074
    const factionColor = new THREE.Color(1, 0.5, 0);
    expect(colorAt(colors!, 0)[0]).toBeCloseTo(factionColor.r, 2);

    // id=2 → faction null → unclaimed
    const unclaimedColor = new THREE.Color(0.1, 0.1, 0.1);
    expect(colorAt(colors!, 1)[0]).toBeCloseTo(unclaimedColor.r, 2);
  });

  // ── Planet Count filter ────────────────────────────────────────────────────

  it("Planet Count: brighter gradient for systems with more planets", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("planetCount"), ids: IDS, pods: [] }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    // planet counts: id=1(idx=0)→5, id=2(idx=1)→0, id=3(idx=2)→12
    const brightness = (idx: number) => {
      const [r, g, b] = colorAt(colors!, idx);
      return r + g + b;
    };
    expect(brightness(1)).toBeLessThan(brightness(0)); // 0 < 5 planets
    expect(brightness(0)).toBeLessThan(brightness(2)); // 5 < 12 planets
    expect(brightness(2)).toBeGreaterThan(brightness(1)); // 12 > 0
  });

  // ── Planet Type filter ─────────────────────────────────────────────────────

  it("Planet Type: systems with the selected type bit set get accent color; others get dim color", () => {
    // Select bit 0 (Temperate, typeId=11)
    // id=1 has bit 0 set; id=2 and id=3 do not
    const { result } = renderHook(() =>
      useOverlayColors({
        overlayConfig: makeConfig("planetType", "color", { planetTypeId: 11 }),
        ids: IDS,
        pods: [],
      }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    const brightnessOf = (idx: number) => colorAt(colors!, idx).reduce((s, v) => s + v, 0);

    // id=1 (idx=0) has bit 0 → accent (bright)
    // id=2 (idx=1) lacks bit → dim (dark)
    expect(brightnessOf(0)).toBeGreaterThan(brightnessOf(1));
  });

  // ── Moon Count filter ──────────────────────────────────────────────────────

  it("Moon Count: gradient scales monotonically with moon count", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("moonCount"), ids: IDS, pods: [] }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    const brightness = (idx: number) => colorAt(colors!, idx).reduce((s, v) => s + v, 0);

    // moon counts: id=1→3, id=2→0, id=3→20
    expect(brightness(1)).toBeLessThan(brightness(0)); // 0 < 3
    expect(brightness(0)).toBeLessThan(brightness(2)); // 3 < 20
  });

  // ── NPC Stations filter ────────────────────────────────────────────────────

  it("NPC Stations: systems with a station are brighter than systems without", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("npcStations"), ids: IDS, pods: [] }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    const brightness = (idx: number) => colorAt(colors!, idx).reduce((s, v) => s + v, 0);

    // id=1 (idx=0) has station; id=2 (idx=1) does not
    expect(brightness(0)).toBeGreaterThan(brightness(1));
  });

  // ── My Structures filter ───────────────────────────────────────────────────

  it("My Structures: systems containing a pod location are accent; others are dim", () => {
    const pods = [
      {
        structureId: "0xaaa",
        ownerAddress: "0xowner",
        locationHash: "h1",
        location: { solarSystemId: 2, x: 0, y: 0, z: 0, salt: "s" },
        podVersion: 1,
        tlkVersion: 1,
        networkNodeId: null,
        createdAt: "",
        updatedAt: "",
      },
    ] as unknown as DecryptedPod[];

    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("myStructures"), ids: IDS, pods }),
    );
    const { colors } = result.current;
    expect(colors).toBeInstanceOf(Float32Array);

    const brightness = (idx: number) => colorAt(colors!, idx).reduce((s, v) => s + v, 0);

    // id=2 (idx=1) has a pod → accent (bright)
    // id=1 (idx=0) does not → dim (dark)
    expect(brightness(1)).toBeGreaterThan(brightness(0));
  });

  it("My Structures: returns dim colors (not null) even when pods array is empty", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("myStructures"), ids: IDS, pods: [] }),
    );
    expect(result.current.colors).toBeInstanceOf(Float32Array);
    expect(result.current.colors!.length).toBe(IDS.length * 3);
  });

  // ── Render mode: Color ─────────────────────────────────────────────────────

  it("Color mode: glowMask and densityMask are both null", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("region", "color"), ids: IDS, pods: [] }),
    );
    expect(result.current.glowMask).toBeNull();
    expect(result.current.densityMask).toBeNull();
  });

  // ── Render mode: Glow ─────────────────────────────────────────────────────

  it("Glow mode: glowMask is a Float32Array; densityMask is null", () => {
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("npcStations", "glow"), ids: IDS, pods: [] }),
    );
    expect(result.current.glowMask).toBeInstanceOf(Float32Array);
    expect(result.current.glowMask!.length).toBe(IDS.length);
    expect(result.current.densityMask).toBeNull();
  });

  it("Glow mode: qualifying systems have glowMask=1.0; non-qualifying have glowMask=0.0", () => {
    // id=1 has NPC station; id=2 and id=3 do not
    const { result } = renderHook(() =>
      useOverlayColors({ overlayConfig: makeConfig("npcStations", "glow"), ids: IDS, pods: [] }),
    );
    const { glowMask } = result.current;
    expect(glowMask![0]).toBeCloseTo(1.0, 3); // id=1 — has station
    expect(glowMask![1]).toBeCloseTo(0.0, 3); // id=2 — no station
    expect(glowMask![2]).toBeCloseTo(0.0, 3); // id=3 — no station
  });

  // ── Render mode: Density Gradient ─────────────────────────────────────────

  it("Density Gradient mode: densityMask is a Float32Array; glowMask is null", () => {
    const { result } = renderHook(() =>
      useOverlayColors({
        overlayConfig: makeConfig("npcStations", "densityGradient"),
        ids: IDS,
        pods: [],
      }),
    );
    expect(result.current.densityMask).toBeInstanceOf(Float32Array);
    expect(result.current.densityMask!.length).toBe(IDS.length);
    expect(result.current.glowMask).toBeNull();
  });

  it("Density Gradient mode: qualifying systems have densityMask=1.0; others have 0.0", () => {
    // id=1 has NPC station
    const { result } = renderHook(() =>
      useOverlayColors({
        overlayConfig: makeConfig("npcStations", "densityGradient"),
        ids: IDS,
        pods: [],
      }),
    );
    const { densityMask } = result.current;
    expect(densityMask![0]).toBeCloseTo(1.0, 3); // id=1 — has station
    expect(densityMask![1]).toBeCloseTo(0.0, 3); // id=2 — no station
    expect(densityMask![2]).toBeCloseTo(0.0, 3); // id=3 — no station
  });

  // ── Output dimensions ─────────────────────────────────────────────────────

  it("colors length is always 3 * ids.length regardless of filter", () => {
    for (const filter of [
      "region", "constellation", "ancientCivilizations",
      "planetCount", "moonCount", "npcStations",
    ] as OverlayConfig["filter"][]) {
      const { result } = renderHook(() =>
        useOverlayColors({ overlayConfig: makeConfig(filter), ids: IDS, pods: [] }),
      );
      expect(result.current.colors!.length).toBe(IDS.length * 3);
    }
  });
});
