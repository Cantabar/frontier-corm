# Assembly Metadata

## Overview

The assembly_metadata package provides an on-chain registry for user-defined structure metadata (names, descriptions). It allows players to assign human-readable names to their structures (SSU, Gate, Turret, NetworkNode, Assembly) which are displayed in the web UI for easier identification.

## Architecture

A shared `MetadataRegistry` singleton holds a `Table<ID, MetadataEntry>` mapping assembly IDs to metadata. Creation requires proof of assembly ownership via the world contract's `OwnerCap<T>`. Updates and deletes are sender-gated. Admin cleanup via `CormAdminCap` enables automated removal of stale entries when structures are unanchored.

## Dependencies

- `world` — for `world::access::OwnerCap<T>` and `is_authorized`
- `corm_auth` — for `CormAdminCap` (admin cleanup)

## Module: `assembly_metadata::assembly_metadata`

### Structs

- **`MetadataRegistry`** — shared singleton created in `init`. Contains `Table<ID, MetadataEntry>`.
- **`MetadataEntry`** — `store, drop`. Fields: `owner: address`, `name: String` (max 64 bytes), `description: String` (max 256 bytes).

### Entry Functions

- `create_metadata<T: key>(registry, owner_cap, assembly_id, name, description, ctx)` — OwnerCap-verified creation
- `update_metadata(registry, assembly_id, name, description, ctx)` — sender == stored owner
- `delete_metadata(registry, assembly_id, ctx)` — sender == stored owner
- `admin_cleanup(registry, admin_cap, assembly_id)` — CormAdminCap-gated, no-op if entry doesn't exist

### Events

- `MetadataRegistryCreatedEvent { registry_id }`
- `MetadataCreatedEvent { assembly_id, name, description, owner }`
- `MetadataUpdatedEvent { assembly_id, name, description }`
- `MetadataDeletedEvent { assembly_id }`

## Features

- OwnerCap<T>-gated metadata creation (proves assembly ownership)
- Generic over T — works for all structure types (Assembly, StorageUnit, Gate, Turret, NetworkNode)
- Sender-gated updates and deletes
- CormAdminCap-gated admin cleanup for automated stale entry removal
- Name length validation (max 64 bytes) and description length validation (max 256 bytes)
- Graceful no-op on admin_cleanup for non-existent entries
