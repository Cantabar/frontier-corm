import { describe, it, expect } from "vitest";
import { buildAreaShapes } from "./areaClusters";

interface StarInput {
  pos: [number, number, number];
  category: number; // -1 = non-qualifying
  color?: [number, number, number];
}

function buildParams(stars: StarInput[], discoveryDistanceLy: number) {
  const N = stars.length;
  const positions = new Float32Array(N * 3);
  const categoryKeys = new Int32Array(N);
  const overlayColors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const s = stars[i];
    positions[i * 3]     = s.pos[0];
    positions[i * 3 + 1] = s.pos[1];
    positions[i * 3 + 2] = s.pos[2];
    categoryKeys[i] = s.category;
    const c = s.color ?? [1, 0, 0];
    overlayColors[i * 3]     = c[0];
    overlayColors[i * 3 + 1] = c[1];
    overlayColors[i * 3 + 2] = c[2];
  }
  return { positions, categoryKeys, overlayColors, discoveryDistanceLy };
}

describe("buildAreaShapes", () => {
  it("returns empty output when there are no qualifying stars", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: -1 },
          { pos: [10, 0, 0], category: -1 },
        ],
        50,
      ),
    );
    expect(shapes.hullVertexPositions.length).toBe(0);
    expect(shapes.hullVertexColors.length).toBe(0);
  });

  it("returns empty output when discovery distance is non-positive", () => {
    expect(buildAreaShapes(buildParams([{ pos: [0, 0, 0], category: 1 }], 0)).hullVertexPositions.length).toBe(0);
    expect(buildAreaShapes(buildParams([{ pos: [0, 0, 0], category: 1 }], -5)).hullVertexPositions.length).toBe(0);
  });

  it("emits no triangles for singleton or two-star clusters", () => {
    const singleton = buildAreaShapes(buildParams([{ pos: [0, 0, 0], category: 1 }], 100));
    expect(singleton.hullVertexPositions.length).toBe(0);

    const pair = buildAreaShapes(buildParams(
      [
        { pos: [0, 0, 0], category: 1 },
        { pos: [50, 0, 0], category: 1 },
      ],
      100,
    ));
    expect(pair.hullVertexPositions.length).toBe(0);
  });

  it("does not merge stars from different categories even when spatially near", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: 1 },
          { pos: [2, 0, 0], category: 2 },
          { pos: [4, 0, 0], category: 1 },
        ],
        100,
      ),
    );
    // Each category has only 2 stars at most → no triangles.
    expect(shapes.hullVertexPositions.length).toBe(0);
  });

  it("does not merge same-category stars farther apart than discovery distance", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: 1 },
          { pos: [200, 0, 0], category: 1 },
          { pos: [400, 0, 0], category: 1 },
        ],
        100,
      ),
    );
    expect(shapes.hullVertexPositions.length).toBe(0);
  });

  it("emits a double-sided triangle for a 3-star cluster", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: 1 },
          { pos: [10, 0, 0], category: 1 },
          { pos: [5, 10, 0], category: 1 },
        ],
        100,
      ),
    );
    // 2 triangles (front + back face) × 3 verts × 3 floats = 18 floats.
    expect(shapes.hullVertexPositions.length).toBe(18);
    expect(shapes.hullVertexColors.length).toBe(18);
  });

  it("emits hull triangles for a tetrahedron cluster and ignores interior points", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: 1 },
          { pos: [100, 0, 0], category: 1 },
          { pos: [50, 100, 0], category: 1 },
          { pos: [50, 50, 100], category: 1 },
          { pos: [50, 38, 25], category: 1 },     // interior point — shouldn't add faces
        ],
        1000,
      ),
    );
    // Tetrahedron hull: 4 faces × 3 verts × 3 floats = 36 floats.
    expect(shapes.hullVertexPositions.length).toBe(36);
  });

  it("colors every hull vertex with the cluster's average overlay color", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: 1,    color: [0.2, 0.0, 0.0] },
          { pos: [100, 0, 0], category: 1,  color: [0.0, 0.2, 0.0] },
          { pos: [50, 100, 0], category: 1, color: [0.0, 0.0, 0.2] },
          { pos: [50, 50, 100], category: 1, color: [0.2, 0.2, 0.2] },
        ],
        1000,
      ),
    );
    const expectedR = (0.2 + 0.0 + 0.0 + 0.2) / 4;
    const expectedG = (0.0 + 0.2 + 0.0 + 0.2) / 4;
    const expectedB = (0.0 + 0.0 + 0.2 + 0.2) / 4;
    for (let v = 0; v < shapes.hullVertexColors.length / 3; v++) {
      expect(shapes.hullVertexColors[v * 3]).toBeCloseTo(expectedR, 5);
      expect(shapes.hullVertexColors[v * 3 + 1]).toBeCloseTo(expectedG, 5);
      expect(shapes.hullVertexColors[v * 3 + 2]).toBeCloseTo(expectedB, 5);
    }
  });

  it("skips stars whose categoryKey is negative", () => {
    const shapes = buildAreaShapes(
      buildParams(
        [
          { pos: [0, 0, 0], category: -1 },
          { pos: [10, 0, 0], category: 1 },
          { pos: [20, 0, 0], category: 1 },
          { pos: [15, 8, 0], category: 1 },
        ],
        100,
      ),
    );
    // 3 qualifying stars → one double-sided triangle (18 floats).
    expect(shapes.hullVertexPositions.length).toBe(18);
  });
});
