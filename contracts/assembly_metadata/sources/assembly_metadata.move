/// Assembly Metadata — on-chain registry mapping assembly IDs to
/// user-defined metadata (name, description).
///
/// A shared `MetadataRegistry` stores entries keyed by assembly ID.
/// Creation requires an `OwnerCap<T>` from the world contracts to prove
/// assembly ownership. Updates and deletes are sender-gated (must match
/// the stored owner). Admin cleanup via `CormAdminCap` allows the
/// indexer's cleanup worker to remove stale entries when structures are
/// unanchored or destroyed.
module assembly_metadata::assembly_metadata;

use std::string::String;
use sui::event;
use sui::table::{Self, Table};
use world::access::{Self, OwnerCap};
use corm_auth::corm_auth::CormAdminCap;

// === Errors ===
const ENotOwner: u64 = 0;
const EEntryAlreadyExists: u64 = 1;
const EEntryNotFound: u64 = 2;
const ENameTooLong: u64 = 3;
const EDescriptionTooLong: u64 = 4;
const ENotAuthorized: u64 = 5;

// === Constants ===
const MAX_NAME_BYTES: u64 = 64;
const MAX_DESCRIPTION_BYTES: u64 = 256;

// === Structs ===

/// Shared singleton registry. Created once in `init`.
public struct MetadataRegistry has key {
    id: UID,
    entries: Table<ID, MetadataEntry>,
}

/// A single metadata entry for an assembly. Stored inside the registry
/// Table, not as a standalone object.
public struct MetadataEntry has store, drop {
    /// Wallet address that created this entry (used for update/delete auth).
    owner: address,
    /// User-defined name (max 64 bytes).
    name: String,
    /// User-defined description (max 256 bytes).
    description: String,
}

// === Events ===

public struct MetadataRegistryCreatedEvent has copy, drop {
    registry_id: ID,
}

public struct MetadataCreatedEvent has copy, drop {
    assembly_id: ID,
    name: String,
    description: String,
    owner: address,
}

public struct MetadataUpdatedEvent has copy, drop {
    assembly_id: ID,
    name: String,
    description: String,
}

public struct MetadataDeletedEvent has copy, drop {
    assembly_id: ID,
}

// === Init ===

/// Creates the singleton MetadataRegistry on module publish.
fun init(ctx: &mut TxContext) {
    let registry = MetadataRegistry {
        id: object::new(ctx),
        entries: table::new<ID, MetadataEntry>(ctx),
    };
    event::emit(MetadataRegistryCreatedEvent {
        registry_id: object::id(&registry),
    });
    transfer::share_object(registry);
}

// === Public functions ===

/// Create a metadata entry for an assembly. Requires an `OwnerCap<T>`
/// proving the caller owns the assembly. Generic over T so it works for
/// all structure types (Assembly, StorageUnit, Gate, Turret, NetworkNode).
public fun create_metadata<T: key>(
    registry: &mut MetadataRegistry,
    owner_cap: &OwnerCap<T>,
    assembly_id: ID,
    name: String,
    description: String,
    ctx: &TxContext,
) {
    assert!(access::is_authorized(owner_cap, assembly_id), ENotAuthorized);
    assert!(!registry.entries.contains(assembly_id), EEntryAlreadyExists);
    assert!(name.length() <= MAX_NAME_BYTES, ENameTooLong);
    assert!(description.length() <= MAX_DESCRIPTION_BYTES, EDescriptionTooLong);

    let owner = ctx.sender();

    registry.entries.add(assembly_id, MetadataEntry {
        owner,
        name,
        description,
    });

    event::emit(MetadataCreatedEvent {
        assembly_id,
        name,
        description,
        owner,
    });
}

/// Update the metadata for an assembly. Only the original owner can update.
public fun update_metadata(
    registry: &mut MetadataRegistry,
    assembly_id: ID,
    name: String,
    description: String,
    ctx: &TxContext,
) {
    assert!(registry.entries.contains(assembly_id), EEntryNotFound);
    assert!(name.length() <= MAX_NAME_BYTES, ENameTooLong);
    assert!(description.length() <= MAX_DESCRIPTION_BYTES, EDescriptionTooLong);

    let entry = registry.entries.borrow_mut(assembly_id);
    assert!(ctx.sender() == entry.owner, ENotOwner);

    entry.name = name;
    entry.description = description;

    event::emit(MetadataUpdatedEvent {
        assembly_id,
        name,
        description,
    });
}

/// Delete the metadata for an assembly. Only the original owner can delete.
public fun delete_metadata(
    registry: &mut MetadataRegistry,
    assembly_id: ID,
    ctx: &TxContext,
) {
    assert!(registry.entries.contains(assembly_id), EEntryNotFound);

    let entry = registry.entries.borrow(assembly_id);
    assert!(ctx.sender() == entry.owner, ENotOwner);

    registry.entries.remove(assembly_id);

    event::emit(MetadataDeletedEvent { assembly_id });
}

/// Admin cleanup — remove a metadata entry without owner check.
/// Used by the cleanup worker when a structure is unanchored/destroyed.
public fun admin_cleanup(
    registry: &mut MetadataRegistry,
    _admin_cap: &CormAdminCap,
    assembly_id: ID,
) {
    if (registry.entries.contains(assembly_id)) {
        registry.entries.remove(assembly_id);
        event::emit(MetadataDeletedEvent { assembly_id });
    };
}

// === View functions ===

public fun has_metadata(registry: &MetadataRegistry, assembly_id: ID): bool {
    registry.entries.contains(assembly_id)
}

public fun get_name(registry: &MetadataRegistry, assembly_id: ID): String {
    assert!(registry.entries.contains(assembly_id), EEntryNotFound);
    registry.entries.borrow(assembly_id).name
}

public fun get_description(registry: &MetadataRegistry, assembly_id: ID): String {
    assert!(registry.entries.contains(assembly_id), EEntryNotFound);
    registry.entries.borrow(assembly_id).description
}

public fun get_owner(registry: &MetadataRegistry, assembly_id: ID): address {
    assert!(registry.entries.contains(assembly_id), EEntryNotFound);
    registry.entries.borrow(assembly_id).owner
}

// === Test-only helpers ===

#[test_only]
public fun create_registry_for_testing(ctx: &mut TxContext): MetadataRegistry {
    MetadataRegistry {
        id: object::new(ctx),
        entries: table::new<ID, MetadataEntry>(ctx),
    }
}

#[test_only]
public fun destroy_registry_for_testing(registry: MetadataRegistry) {
    let MetadataRegistry { id, entries } = registry;
    entries.drop();
    id.delete();
}
