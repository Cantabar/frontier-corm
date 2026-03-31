/// CormState — on-chain shared object representing a single corm's canonical
/// state. Each network node hosts one corm; all players on that node share
/// the same CormState and its progression.
///
/// Phase transitions, stability/corruption updates, and MintCap issuance
/// are managed by the corm-brain service via its funded keypair.
module corm_state::corm_state;

use sui::event;
use corm_auth::corm_auth::CormAdminCap;
use corm_state::corm_coin::{Self, MintCap};

// === Errors ===
const ENotAdmin: u64 = 0;
const EPhaseRegression: u64 = 1;
const EMeterOutOfRange: u64 = 2;

// === Structs ===

/// Shared config created once by admin after deploy. Stores the address of
/// the corm-brain service keypair so that player-initiated `install` can
/// route authority (admin + MintCap) to the brain automatically.
public struct CormConfig has key {
    id: UID,
    /// Address of the corm-brain service keypair.
    brain_address: address,
}

/// Shared object — one per corm (per network node).
public struct CormState has key {
    id: UID,
    /// The network node this corm is bound to.
    network_node_id: ID,
    /// Current phase (0–6). One-way progression.
    phase: u8,
    /// Stability meter (0–100).
    stability: u64,
    /// Corruption meter (0–100).
    corruption: u64,
    /// Address authorized to update this state (corm-brain keypair).
    admin: address,
}

// === Events ===

public struct CormStateCreatedEvent has copy, drop {
    corm_state_id: ID,
    network_node_id: ID,
    admin: address,
}

public struct CormStateUpdatedEvent has copy, drop {
    corm_state_id: ID,
    phase: u8,
    stability: u64,
    corruption: u64,
}

// === Public functions ===

/// Create the shared `CormConfig`. Admin-only, called once after deploy.
/// `brain_address` is the corm-brain service keypair that will administer
/// all CormState objects created via `install`.
public fun create_config(
    _admin_cap: &CormAdminCap,
    brain_address: address,
    ctx: &mut TxContext,
) {
    transfer::share_object(CormConfig {
        id: object::new(ctx),
        brain_address,
    });
}

/// Update the brain address stored in `CormConfig`. Admin-only.
public fun set_brain_address(
    config: &mut CormConfig,
    _admin_cap: &CormAdminCap,
    new_brain_address: address,
) {
    config.brain_address = new_brain_address;
}

/// Install a corm on a network node. **Permissionless** — any player can
/// call this to create a CormState for a node they own.
///
/// The CormState `admin` is set to the brain address from `CormConfig`,
/// and the `MintCap` is transferred directly to the brain so the player
/// never holds minting authority.
public fun install(
    config: &CormConfig,
    network_node_id: ID,
    ctx: &mut TxContext,
) {
    let state = CormState {
        id: object::new(ctx),
        network_node_id,
        phase: 0,
        stability: 0,
        corruption: 0,
        admin: config.brain_address,
    };

    let state_id = object::id(&state);

    event::emit(CormStateCreatedEvent {
        corm_state_id: state_id,
        network_node_id,
        admin: config.brain_address,
    });

    let mint_cap = corm_coin::create_mint_cap(state_id, ctx);

    transfer::share_object(state);
    transfer::public_transfer(mint_cap, config.brain_address);
}

/// Create a new CormState for a network node. Requires `CormAdminCap` to
/// prove the caller is the authorized CORM operator.
///
/// Returns a `MintCap` transferred to the caller so the corm-brain can
/// mint CORM tokens for this corm.
public fun create(
    _admin_cap: &CormAdminCap,
    network_node_id: ID,
    ctx: &mut TxContext,
): MintCap {
    let state = CormState {
        id: object::new(ctx),
        network_node_id,
        phase: 0,
        stability: 0,
        corruption: 0,
        admin: ctx.sender(),
    };

    let state_id = object::id(&state);

    event::emit(CormStateCreatedEvent {
        corm_state_id: state_id,
        network_node_id,
        admin: ctx.sender(),
    });

    let mint_cap = corm_coin::create_mint_cap(state_id, ctx);

    transfer::share_object(state);

    mint_cap
}

/// Update the corm's phase, stability, and corruption. Only the admin
/// (corm-brain keypair) can call this.
///
/// Phase must not regress. Stability and corruption must be 0–100.
public fun update_state(
    state: &mut CormState,
    new_phase: u8,
    new_stability: u64,
    new_corruption: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == state.admin, ENotAdmin);
    assert!(new_phase >= state.phase, EPhaseRegression);
    assert!(new_stability <= 100, EMeterOutOfRange);
    assert!(new_corruption <= 100, EMeterOutOfRange);

    state.phase = new_phase;
    state.stability = new_stability;
    state.corruption = new_corruption;

    event::emit(CormStateUpdatedEvent {
        corm_state_id: object::id(state),
        phase: new_phase,
        stability: new_stability,
        corruption: new_corruption,
    });
}

/// Reset the corm's phase, stability, and corruption. Only the admin
/// (corm-brain keypair) can call this.
///
/// Unlike `update_state`, this function allows phase regression —
/// it is the admin escape hatch for recovering corms stuck at invalid phases.
public fun reset_state(
    state: &mut CormState,
    new_phase: u8,
    new_stability: u64,
    new_corruption: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == state.admin, ENotAdmin);
    assert!(new_stability <= 100, EMeterOutOfRange);
    assert!(new_corruption <= 100, EMeterOutOfRange);

    state.phase = new_phase;
    state.stability = new_stability;
    state.corruption = new_corruption;

    event::emit(CormStateUpdatedEvent {
        corm_state_id: object::id(state),
        phase: new_phase,
        stability: new_stability,
        corruption: new_corruption,
    });
}

/// Transfer admin authority to a new address. Only current admin can call.
public fun transfer_admin(
    state: &mut CormState,
    new_admin: address,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == state.admin, ENotAdmin);
    state.admin = new_admin;
}

// === View functions ===

public fun network_node_id(state: &CormState): ID { state.network_node_id }
public fun phase(state: &CormState): u8 { state.phase }
public fun stability(state: &CormState): u64 { state.stability }
public fun corruption(state: &CormState): u64 { state.corruption }
public fun admin(state: &CormState): address { state.admin }
public fun brain_address(config: &CormConfig): address { config.brain_address }

// === Test-only helpers ===

#[test_only]
public fun create_config_for_testing(
    brain_address: address,
    ctx: &mut TxContext,
): CormConfig {
    CormConfig {
        id: object::new(ctx),
        brain_address,
    }
}

#[test_only]
public fun destroy_config_for_testing(config: CormConfig) {
    let CormConfig { id, .. } = config;
    id.delete();
}

#[test_only]
public fun destroy_for_testing(state: CormState) {
    let CormState { id, .. } = state;
    id.delete();
}
