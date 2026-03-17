# Shadow Location Network — Privacy-Preserving Structure Locations

## Problem
CCP's location obfuscation update offers only two extremes: fully hidden or
permanently public coordinates. Neither works for CORM — players won't opt into
permanent public visibility, but Tribes need location awareness for contracts,
transport routing, and forge logistics.

## Design Decision Summary
- **Ed25519 → X25519 conversion** for key wrapping (no second keypair).
- **Lazy TLK rotation** on member removal (acceptable at hackathon scale).
- **Poseidon hash** for location commitments (ZK-friendly, avoids Phase 2 migration).

## Phase 1 — Signed Location PODs + Tribe Encryption (MVP)

### Layer 1: Location POD
A self-issued attestation signed by the player's SUI wallet:
- `structure_id`, `owner_address`, `solar_system_id`, `x`, `y`, `z`, `salt`
- `location_hash`: Poseidon(x, y, z, salt) — public commitment
- `signature`: Ed25519 over all fields

Key properties: self-sovereign (wallet-signed), revocable, and ZK-ready
(Poseidon commitment works unchanged in Phase 2).

### Layer 2: Tribe-Scoped Encryption
- AES-256-GCM "Tribe Location Key" (TLK) per tribe.
- TLK wrapped to each member's X25519 public key (derived from Ed25519 wallet key).
- Server stores only ciphertext. Decryption is client-side only.
- Member join → wrap TLK to new member.
- Member removal → generate new TLK, lazy re-encryption by POD owners.

### Server
- Postgres tables: `location_pods`, `tribe_location_keys`
- API endpoints on existing Express server:
  - `POST /api/v1/locations/pod` — submit/update POD
  - `GET  /api/v1/locations/tribe/:tribeId` — list tribe PODs
  - `GET  /api/v1/locations/pod/:structureId` — single POD
  - `DELETE /api/v1/locations/pod/:structureId` — revoke POD
  - `GET  /api/v1/locations/keys/:tribeId` — fetch wrapped TLK
  - `POST /api/v1/locations/keys/rotate` — rotate TLK (officer+)
- Wallet signature challenge for auth (Ed25519 verify).

### Client
- `@noble/ed25519` + `@noble/curves` for signing and X25519 conversion.
- `circomlibjs` (Poseidon only) for commitment hash.
- Web Crypto API (AES-256-GCM) for symmetric encrypt/decrypt.
- New `useLocationPods` hook + "Register Location" UI flow.

### Implementation Order
1. Postgres schema migration
2. Server-side TLK generation + key wrapping
3. API endpoints with wallet-sig auth
4. Client-side POD builder (Poseidon + AES-GCM + Ed25519)
5. Web UI integration

## Phase 2 — ZK Location Filters (Future)

### Circuits (circom / Groth16)
- **RegionFilter**: proves location is within a bounding box without revealing coordinates.
- **ProximityFilter**: proves distance to a reference point is below threshold.

### Flow
1. Client-side WASM proving via snarkjs.
2. Server indexes proof results alongside PODs.
3. Optional on-chain verification via `sui::groth16`.

### Tooling
- circom circuit compiler
- snarkjs for trusted setup + browser WASM prover
- Community Powers-of-Tau ceremony for universal phase
