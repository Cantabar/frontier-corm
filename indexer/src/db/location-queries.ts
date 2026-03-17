/**
 * Shadow Location Network — database queries for location PODs and TLKs.
 */

import type pg from "pg";

// ============================================================
// Types
// ============================================================

export interface LocationPodRow {
  id: number;
  structure_id: string;
  owner_address: string;
  tribe_id: string;
  location_hash: string;
  /** Base64-encoded AES-256-GCM ciphertext */
  encrypted_blob: Buffer;
  /** Base64-encoded GCM nonce */
  nonce: Buffer;
  signature: string;
  pod_version: number;
  tlk_version: number;
  created_at: string;
  updated_at: string;
}

export interface TribeTlkRow {
  id: number;
  tribe_id: string;
  member_address: string;
  wrapped_key: Buffer;
  tlk_version: number;
  created_at: string;
}

// ============================================================
// Location POD — upsert / query / delete
// ============================================================

const UPSERT_POD_SQL = `
  INSERT INTO location_pods (
    structure_id, owner_address, tribe_id, location_hash,
    encrypted_blob, nonce, signature, pod_version, tlk_version
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (structure_id, tribe_id) DO UPDATE SET
    owner_address  = EXCLUDED.owner_address,
    location_hash  = EXCLUDED.location_hash,
    encrypted_blob = EXCLUDED.encrypted_blob,
    nonce          = EXCLUDED.nonce,
    signature      = EXCLUDED.signature,
    pod_version    = EXCLUDED.pod_version,
    tlk_version    = EXCLUDED.tlk_version,
    updated_at     = NOW()
  RETURNING id
`;

export async function upsertLocationPod(
  pool: pg.Pool,
  pod: {
    structureId: string;
    ownerAddress: string;
    tribeId: string;
    locationHash: string;
    encryptedBlob: Buffer;
    nonce: Buffer;
    signature: string;
    podVersion: number;
    tlkVersion: number;
  },
): Promise<number> {
  const result = await pool.query(UPSERT_POD_SQL, [
    pod.structureId,
    pod.ownerAddress,
    pod.tribeId,
    pod.locationHash,
    pod.encryptedBlob,
    pod.nonce,
    pod.signature,
    pod.podVersion,
    pod.tlkVersion,
  ]);
  return result.rows[0]?.id ?? 0;
}

export async function getLocationPodsByTribe(
  pool: pg.Pool,
  tribeId: string,
): Promise<LocationPodRow[]> {
  const result = await pool.query(
    "SELECT * FROM location_pods WHERE tribe_id = $1 ORDER BY updated_at DESC",
    [tribeId],
  );
  return result.rows as LocationPodRow[];
}

export async function getLocationPod(
  pool: pg.Pool,
  structureId: string,
  tribeId: string,
): Promise<LocationPodRow | undefined> {
  const result = await pool.query(
    "SELECT * FROM location_pods WHERE structure_id = $1 AND tribe_id = $2",
    [structureId, tribeId],
  );
  return result.rows[0] as LocationPodRow | undefined;
}

export async function deleteLocationPod(
  pool: pg.Pool,
  structureId: string,
  ownerAddress: string,
): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM location_pods WHERE structure_id = $1 AND owner_address = $2",
    [structureId, ownerAddress],
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Tribe Location Keys
// ============================================================

const UPSERT_TLK_SQL = `
  INSERT INTO tribe_location_keys (tribe_id, member_address, wrapped_key, tlk_version)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (tribe_id, member_address, tlk_version) DO UPDATE SET
    wrapped_key = EXCLUDED.wrapped_key
  RETURNING id
`;

export async function upsertTlk(
  pool: pg.Pool,
  tribeId: string,
  memberAddress: string,
  wrappedKey: Buffer,
  tlkVersion: number,
): Promise<number> {
  const result = await pool.query(UPSERT_TLK_SQL, [
    tribeId,
    memberAddress,
    wrappedKey,
    tlkVersion,
  ]);
  return result.rows[0]?.id ?? 0;
}

export async function getTlkForMember(
  pool: pg.Pool,
  tribeId: string,
  memberAddress: string,
): Promise<TribeTlkRow | undefined> {
  const result = await pool.query(
    `SELECT * FROM tribe_location_keys
     WHERE tribe_id = $1 AND member_address = $2
     ORDER BY tlk_version DESC LIMIT 1`,
    [tribeId, memberAddress],
  );
  return result.rows[0] as TribeTlkRow | undefined;
}

export async function getLatestTlkVersion(
  pool: pg.Pool,
  tribeId: string,
): Promise<number> {
  const result = await pool.query(
    "SELECT MAX(tlk_version) as v FROM tribe_location_keys WHERE tribe_id = $1",
    [tribeId],
  );
  return Number(result.rows[0]?.v ?? 0);
}

export async function getAllTlksForTribe(
  pool: pg.Pool,
  tribeId: string,
  tlkVersion: number,
): Promise<TribeTlkRow[]> {
  const result = await pool.query(
    "SELECT * FROM tribe_location_keys WHERE tribe_id = $1 AND tlk_version = $2",
    [tribeId, tlkVersion],
  );
  return result.rows as TribeTlkRow[];
}

// ============================================================
// ZK Location Filter Proofs
// ============================================================

export interface FilterProofRow {
  id: number;
  structure_id: string;
  tribe_id: string;
  location_hash: string;
  filter_type: "region" | "proximity";
  filter_key: string;
  public_signals: string[];
  proof_json: Record<string, unknown>;
  created_at: string;
  verified_at: string;
}

const UPSERT_FILTER_PROOF_SQL = `
  INSERT INTO location_filter_proofs (
    structure_id, tribe_id, location_hash, filter_type, filter_key,
    public_signals, proof_json
  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (structure_id, tribe_id, filter_type, filter_key) DO UPDATE SET
    public_signals = EXCLUDED.public_signals,
    proof_json     = EXCLUDED.proof_json,
    verified_at    = NOW()
  RETURNING id
`;

export async function upsertFilterProof(
  pool: pg.Pool,
  proof: {
    structureId: string;
    tribeId: string;
    locationHash: string;
    filterType: "region" | "proximity";
    filterKey: string;
    publicSignals: string[];
    proofJson: Record<string, unknown>;
  },
): Promise<number> {
  const result = await pool.query(UPSERT_FILTER_PROOF_SQL, [
    proof.structureId,
    proof.tribeId,
    proof.locationHash,
    proof.filterType,
    proof.filterKey,
    JSON.stringify(proof.publicSignals),
    JSON.stringify(proof.proofJson),
  ]);
  return result.rows[0]?.id ?? 0;
}

export async function getFilterProofsByKey(
  pool: pg.Pool,
  tribeId: string,
  filterType: "region" | "proximity",
  filterKey: string,
): Promise<FilterProofRow[]> {
  const result = await pool.query(
    `SELECT fp.*, lp.owner_address, lp.encrypted_blob, lp.nonce, lp.signature,
            lp.pod_version, lp.tlk_version
     FROM location_filter_proofs fp
     JOIN location_pods lp ON lp.structure_id = fp.structure_id AND lp.tribe_id = fp.tribe_id
     WHERE fp.tribe_id = $1 AND fp.filter_type = $2 AND fp.filter_key = $3
     ORDER BY fp.verified_at DESC`,
    [tribeId, filterType, filterKey],
  );
  return result.rows as FilterProofRow[];
}

export async function getFilterProofsForStructure(
  pool: pg.Pool,
  structureId: string,
  tribeId: string,
): Promise<FilterProofRow[]> {
  const result = await pool.query(
    `SELECT * FROM location_filter_proofs
     WHERE structure_id = $1 AND tribe_id = $2
     ORDER BY verified_at DESC`,
    [structureId, tribeId],
  );
  return result.rows as FilterProofRow[];
}
