import * as THREE from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";

export interface AreaShapes {
  /** Flat xyz positions of hull triangle vertices. Length = 3 * triangleVertexCount. */
  hullVertexPositions: Float32Array;
  /** Parallel rgb colors for each hull vertex. Length = 3 * triangleVertexCount. */
  hullVertexColors: Float32Array;
}

export interface AreaClusteringParams {
  /** Flat xyz buffer of every system in the galaxy (ly units). Length = 3 * N. */
  positions: Float32Array;
  /** Category id per system. Negative values are non-qualifying and skipped. */
  categoryKeys: Int32Array;
  /** Per-system overlay color (rgb). Length = 3 * N. */
  overlayColors: Float32Array;
  /** Maximum distance between same-category stars for them to share a cluster (ly). */
  discoveryDistanceLy: number;
}

/**
 * Computes area-mode geometry:
 *   1. Union-finds qualifying stars into clusters (same category + within discovery distance).
 *   2. Per cluster: fan-triangulates the 3D convex hull of its stars to fill the interior.
 *      Colors every vertex with the cluster's average overlay color so categorical clusters
 *      stay uniform and gradient clusters get a single coherent fill color.
 */
export function buildAreaShapes(params: AreaClusteringParams): AreaShapes {
  const empty: AreaShapes = {
    hullVertexPositions: new Float32Array(0),
    hullVertexColors: new Float32Array(0),
  };

  const { positions, categoryKeys, overlayColors, discoveryDistanceLy } = params;
  const N = categoryKeys.length;
  if (discoveryDistanceLy <= 0 || N === 0) return empty;

  const distSq = discoveryDistanceLy * discoveryDistanceLy;

  const qualifying: number[] = [];
  const cellMap = new Map<string, number[]>();
  const cell = discoveryDistanceLy;
  for (let i = 0; i < N; i++) {
    if (categoryKeys[i] < 0) continue;
    qualifying.push(i);
    const cx = Math.floor(positions[i * 3]     / cell);
    const cy = Math.floor(positions[i * 3 + 1] / cell);
    const cz = Math.floor(positions[i * 3 + 2] / cell);
    const key = `${cx},${cy},${cz}`;
    let bucket = cellMap.get(key);
    if (!bucket) {
      bucket = [];
      cellMap.set(key, bucket);
    }
    bucket.push(i);
  }
  if (qualifying.length === 0) return empty;

  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  for (const i of qualifying) {
    const xi = positions[i * 3];
    const yi = positions[i * 3 + 1];
    const zi = positions[i * 3 + 2];
    const cxi = Math.floor(xi / cell);
    const cyi = Math.floor(yi / cell);
    const czi = Math.floor(zi / cell);
    const cati = categoryKeys[i];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = cellMap.get(`${cxi + dx},${cyi + dy},${czi + dz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            if (categoryKeys[j] !== cati) continue;
            const ddx = positions[j * 3]     - xi;
            const ddy = positions[j * 3 + 1] - yi;
            const ddz = positions[j * 3 + 2] - zi;
            if (ddx * ddx + ddy * ddy + ddz * ddz <= distSq) {
              const ra = find(i);
              const rb = find(j);
              if (ra !== rb) parent[ra] = rb;
            }
          }
        }
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (const i of qualifying) {
    const root = find(i);
    let arr = clusters.get(root);
    if (!arr) {
      arr = [];
      clusters.set(root, arr);
    }
    arr.push(i);
  }

  const hullPositions: number[] = [];
  const hullColors: number[] = [];

  for (const indices of clusters.values()) {
    let avgR = 0;
    let avgG = 0;
    let avgB = 0;
    for (const k of indices) {
      avgR += overlayColors[k * 3];
      avgG += overlayColors[k * 3 + 1];
      avgB += overlayColors[k * 3 + 2];
    }
    const invN = 1 / indices.length;
    avgR *= invN;
    avgG *= invN;
    avgB *= invN;

    const triangles = computeClusterHull(indices, positions);
    if (triangles === null) continue;

    const triVertCount = triangles.length / 3;
    for (let v = 0; v < triVertCount; v++) {
      hullPositions.push(
        triangles[v * 3],
        triangles[v * 3 + 1],
        triangles[v * 3 + 2],
      );
      hullColors.push(avgR, avgG, avgB);
    }
  }

  return {
    hullVertexPositions: new Float32Array(hullPositions),
    hullVertexColors: new Float32Array(hullColors),
  };
}

/**
 * Returns fan-triangulated hull vertex positions (3 floats per vertex, 9 floats per triangle),
 * or null when the cluster is too small or the hull is degenerate.
 */
function computeClusterHull(indices: number[], positions: Float32Array): Float32Array | null {
  if (indices.length < 3) return null;

  if (indices.length === 3) {
    // Flat triangle rendered double-sided (two winding orders so it shows from either side).
    const i0 = indices[0];
    const i1 = indices[1];
    const i2 = indices[2];
    const p0x = positions[i0 * 3], p0y = positions[i0 * 3 + 1], p0z = positions[i0 * 3 + 2];
    const p1x = positions[i1 * 3], p1y = positions[i1 * 3 + 1], p1z = positions[i1 * 3 + 2];
    const p2x = positions[i2 * 3], p2y = positions[i2 * 3 + 1], p2z = positions[i2 * 3 + 2];
    return new Float32Array([
      p0x, p0y, p0z,  p1x, p1y, p1z,  p2x, p2y, p2z,
      p0x, p0y, p0z,  p2x, p2y, p2z,  p1x, p1y, p1z,
    ]);
  }

  const points: THREE.Vector3[] = new Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    points[k] = new THREE.Vector3(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    );
  }

  let hull: ConvexHull;
  try {
    hull = new ConvexHull().setFromPoints(points);
  } catch {
    return null;
  }
  if (!hull.faces || hull.faces.length === 0) return null;

  const tris: number[] = [];
  for (const face of hull.faces) {
    const startEdge = face.edge;
    if (!startEdge) continue;
    const faceVerts: THREE.Vector3[] = [];
    let edge = startEdge;
    do {
      faceVerts.push(edge.head().point);
      edge = edge.next;
    } while (edge && edge !== startEdge);

    // Fan-triangulate. Hull faces are convex polygons, so this is always valid.
    for (let k = 1; k < faceVerts.length - 1; k++) {
      const a = faceVerts[0];
      const b = faceVerts[k];
      const c = faceVerts[k + 1];
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }

  return tris.length > 0 ? new Float32Array(tris) : null;
}
