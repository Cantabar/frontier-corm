/**
 * Shadow Location Network — browser-side ZK proof generation.
 *
 * Wraps snarkjs Groth16 fullProve() to generate proofs that a
 * Poseidon-committed location satisfies a region or proximity filter.
 *
 * Circuit WASM + zkey files are served as static assets from /zk/.
 * They are produced by `make zk-build` at the project root.
 */

import * as snarkjs from "snarkjs";

// ============================================================
// Constants
// ============================================================

/** Base URL for circuit artefacts served from web/public/zk/ */
const ZK_ASSET_BASE = "/zk";

const REGION_WASM = `${ZK_ASSET_BASE}/region_filter.wasm`;
const REGION_ZKEY = `${ZK_ASSET_BASE}/region_filter_final.zkey`;
const PROXIMITY_WASM = `${ZK_ASSET_BASE}/proximity_filter.wasm`;
const PROXIMITY_ZKEY = `${ZK_ASSET_BASE}/proximity_filter_final.zkey`;

// ============================================================
// Types
// ============================================================

export interface ZkProof {
  proof: Record<string, unknown>;
  publicSignals: string[];
}

export interface RegionFilterInput {
  /** Hex-encoded Poseidon commitment from the location POD */
  locationHash: string;
  /** Raw (un-biased) game coordinates */
  x: number;
  y: number;
  z: number;
  /** 256-bit salt used in the original Poseidon commitment */
  salt: bigint;
  /** Region bounding-box (raw game coordinates) */
  regionXMin: number;
  regionXMax: number;
  regionYMin: number;
  regionYMax: number;
  regionZMin: number;
  regionZMax: number;
}

export interface ProximityFilterInput {
  locationHash: string;
  x: number;
  y: number;
  z: number;
  salt: bigint;
  /** Reference point (raw game coordinates) */
  refX: number;
  refY: number;
  refZ: number;
  /** Maximum distance (will be squared for the circuit) */
  maxDistance: number;
}

// ============================================================
// Proof Generation
// ============================================================

/**
 * Generate a Groth16 proof that a location lies within a 3D bounding box.
 *
 * The circuit verifies Poseidon4(x, y, z, salt) == locationHash AND
 * each coordinate is within the specified min/max range.
 */
export async function generateRegionProof(
  input: RegionFilterInput,
): Promise<ZkProof> {
  const circuitInput = {
    locationHash: hexToBigintStr(input.locationHash),
    x: fieldStr(input.x),
    y: fieldStr(input.y),
    z: fieldStr(input.z),
    salt: input.salt.toString(),
    regionXMin: fieldStr(input.regionXMin),
    regionXMax: fieldStr(input.regionXMax),
    regionYMin: fieldStr(input.regionYMin),
    regionYMax: fieldStr(input.regionYMax),
    regionZMin: fieldStr(input.regionZMin),
    regionZMax: fieldStr(input.regionZMax),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    REGION_WASM,
    REGION_ZKEY,
  );

  return { proof: proof as Record<string, unknown>, publicSignals };
}

/**
 * Generate a Groth16 proof that a location is within `maxDistance` of a
 * reference point.
 *
 * The circuit verifies Poseidon4(x, y, z, salt) == locationHash AND
 * (x-refX)² + (y-refY)² + (z-refZ)² ≤ maxDistance².
 */
export async function generateProximityProof(
  input: ProximityFilterInput,
): Promise<ZkProof> {
  const maxDistSq = BigInt(Math.ceil(input.maxDistance)) ** 2n;

  const circuitInput = {
    locationHash: hexToBigintStr(input.locationHash),
    x: fieldStr(input.x),
    y: fieldStr(input.y),
    z: fieldStr(input.z),
    salt: input.salt.toString(),
    refX: fieldStr(input.refX),
    refY: fieldStr(input.refY),
    refZ: fieldStr(input.refZ),
    maxDistanceSquared: maxDistSq.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    PROXIMITY_WASM,
    PROXIMITY_ZKEY,
  );

  return { proof: proof as Record<string, unknown>, publicSignals };
}

// ============================================================
// Helpers
// ============================================================

const BN254_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Convert a possibly-negative game coordinate to its BN254 field element
 * representation (decimal string).
 *
 * Negative values become `p - |value|` which matches `BigInt(x)` modular
 * reduction in poseidon-lite and the circom Poseidon circuit.
 */
function fieldStr(coord: number): string {
  const v = BigInt(coord);
  return (v >= 0n ? v : v + BN254_PRIME).toString();
}

/** Convert a hex-encoded hash (e.g. "0x1a2b…") to a decimal bigint string. */
function hexToBigintStr(hex: string): string {
  return BigInt(hex).toString();
}
