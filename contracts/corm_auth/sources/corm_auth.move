/// Shared SSU extension witness for all Frontier Corm contract modules.
///
/// SSU owners register this witness once via
/// `storage_unit::authorize_extension<CormAuth>()` to grant deposit/withdraw
/// authority to any Corm contract (trustless contracts, multi-input contracts,
/// etc.) on that SSU.
module corm_auth::corm_auth;

/// Typed witness for SSU extension authorization.
public struct CormAuth has drop {}

/// Admin capability for the CORM system. Transferred to the publisher on
/// package deploy. Used to authorise future migrations or admin operations.
public struct CormAdminCap has key, store {
    id: UID,
}

/// Creates the `CormAdminCap` and transfers it to the publisher.
fun init(ctx: &mut TxContext) {
    transfer::transfer(
        CormAdminCap { id: object::new(ctx) },
        ctx.sender(),
    );
}

/// Construct a `CormAuth` witness value.
public fun auth(): CormAuth { CormAuth {} }

// === Test-only helpers ===

#[test_only]
public fun create_admin_cap_for_testing(ctx: &mut TxContext): CormAdminCap {
    CormAdminCap { id: object::new(ctx) }
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: CormAdminCap) {
    let CormAdminCap { id } = cap;
    id.delete();
}
