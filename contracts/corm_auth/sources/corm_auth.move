/// Shared SSU extension witness for all Frontier Corm contract modules.
///
/// SSU owners register this witness once via
/// `storage_unit::authorize_extension<CormAuth>()` to grant deposit/withdraw
/// authority to any Corm contract (trustless contracts, multi-input contracts,
/// etc.) on that SSU.
module corm_auth::corm_auth;

/// Typed witness for SSU extension authorization.
public struct CormAuth has drop {}

/// Construct a `CormAuth` witness value.
public fun auth(): CormAuth { CormAuth {} }
