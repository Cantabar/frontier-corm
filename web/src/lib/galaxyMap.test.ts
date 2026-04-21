import { describe, it, expect } from "vitest";
import { buildGalaxyBuffer, computeGalaxyBounds } from "./galaxyMap";
import type { SolarSystemEntry } from "./solarSystems";
import type { RegionEntry } from "./regions";

const METERS_PER_LY = 9_460_730_472_580_800n;

// ── fixtures ────────────────────────────────────────────────────────────────

const systemA: SolarSystemEntry = {
  id: 1,
  name: "Alpha",
  constellationId: 100,
  regionId: 10,
  x: METERS_PER_LY * 5n,
  y: METERS_PER_LY * -3n,
  z: METERS_PER_LY * 10n,
};

const systemB: SolarSystemEntry = {
  id: 2,
  name: "Beta",
  constellationId: 101,
  regionId: 10,
  x: METERS_PER_LY * -2n,
  y: METERS_PER_LY * 8n,
  z: METERS_PER_LY * 0n,
};

const regionA: RegionEntry = {
  id: 10,
  name: "Region A",
  bounds: {
    xMin: METERS_PER_LY * -10n,
    xMax: METERS_PER_LY * 10n,
    yMin: METERS_PER_LY * -5n,
    yMax: METERS_PER_LY * 5n,
    zMin: METERS_PER_LY * 0n,
    zMax: METERS_PER_LY * 20n,
  },
};

const regionB: RegionEntry = {
  id: 20,
  name: "Region B",
  bounds: {
    xMin: METERS_PER_LY * -20n,
    xMax: METERS_PER_LY * 5n,
    yMin: METERS_PER_LY * -15n,
    yMax: METERS_PER_LY * 3n,
    zMin: METERS_PER_LY * -8n,
    zMax: METERS_PER_LY * 30n,
  },
};

// ── buildGalaxyBuffer ────────────────────────────────────────────────────────

describe("buildGalaxyBuffer", () => {
  it("returns a Float32Array with 3 floats per system", () => {
    const { positions } = buildGalaxyBuffer([systemA, systemB]);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(6);
  });

  it("converts BigInt coords to light-year scale floats", () => {
    const { positions } = buildGalaxyBuffer([systemA]);
    expect(positions[0]).toBeCloseTo(5, 0);
    expect(positions[1]).toBeCloseTo(-3, 0);
    expect(positions[2]).toBeCloseTo(10, 0);
  });

  it("ids array is parallel to positions buffer", () => {
    const { ids } = buildGalaxyBuffer([systemA, systemB]);
    expect(ids).toEqual([1, 2]);
  });

  it("idToIndex maps each system id to its buffer index", () => {
    const { idToIndex } = buildGalaxyBuffer([systemA, systemB]);
    expect(idToIndex.get(1)).toBe(0);
    expect(idToIndex.get(2)).toBe(1);
  });

  it("idToIndex reverse-maps correctly (positions[idx*3] matches system coords)", () => {
    const { positions, idToIndex } = buildGalaxyBuffer([systemA, systemB]);
    const idx = idToIndex.get(2)!;
    expect(positions[idx * 3]).toBeCloseTo(-2, 0);
    expect(positions[idx * 3 + 1]).toBeCloseTo(8, 0);
    expect(positions[idx * 3 + 2]).toBeCloseTo(0, 0);
  });

  it("returns empty buffer for empty input", () => {
    const { positions, ids, idToIndex } = buildGalaxyBuffer([]);
    expect(positions.length).toBe(0);
    expect(ids).toHaveLength(0);
    expect(idToIndex.size).toBe(0);
  });
});

// ── computeGalaxyBounds ──────────────────────────────────────────────────────

describe("computeGalaxyBounds", () => {
  it("returns a bounds object with six numeric fields", () => {
    const bounds = computeGalaxyBounds([regionA]);
    expect(typeof bounds.xMin).toBe("number");
    expect(typeof bounds.xMax).toBe("number");
    expect(typeof bounds.yMin).toBe("number");
    expect(typeof bounds.yMax).toBe("number");
    expect(typeof bounds.zMin).toBe("number");
    expect(typeof bounds.zMax).toBe("number");
  });

  it("returns the region's own bounds (in LY) for a single region", () => {
    const bounds = computeGalaxyBounds([regionA]);
    expect(bounds.xMin).toBeCloseTo(-10, 0);
    expect(bounds.xMax).toBeCloseTo(10, 0);
    expect(bounds.yMin).toBeCloseTo(-5, 0);
    expect(bounds.yMax).toBeCloseTo(5, 0);
    expect(bounds.zMin).toBeCloseTo(0, 0);
    expect(bounds.zMax).toBeCloseTo(20, 0);
  });

  it("takes the union of bounds across multiple regions", () => {
    const bounds = computeGalaxyBounds([regionA, regionB]);
    expect(bounds.xMin).toBeCloseTo(-20, 0);
    expect(bounds.xMax).toBeCloseTo(10, 0);
    expect(bounds.yMin).toBeCloseTo(-15, 0);
    expect(bounds.yMax).toBeCloseTo(5, 0);
    expect(bounds.zMin).toBeCloseTo(-8, 0);
    expect(bounds.zMax).toBeCloseTo(30, 0);
  });
});
