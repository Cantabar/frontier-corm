/// Contract Utilities — shared types, errors, helpers, and events for all
/// trustless contract modules.
///
/// All helper functions are `public(package)` — visible to sibling modules
/// within this package but invisible to external packages.
module trustless_contracts::contract_utils;

use sui::{
    balance::Balance,
    coin,
    event,
    table::Table,
};
use corm_auth::corm_auth::{Self, CormAuth};
use world::character::Character;
use world::inventory;
use world::storage_unit::StorageUnit;

// === Version ===
const CURRENT_CONTRACT_VERSION: u64 = 1;

// === Shared Errors ===
// Used across multiple contract modules. Module-specific errors live in their
// own modules.

const EDeadlineInPast: u64 = 0;
const EContractExpired: u64 = 1;
const EContractNotExpired: u64 = 2;
const EContractFull: u64 = 3;
const EFillerNotAuthorized: u64 = 4;
const ESelfFill: u64 = 5;
const ENotPoster: u64 = 6;
const EContractNotOpen: u64 = 7;
const EZeroQuantity: u64 = 8;
const EInsufficientFill: u64 = 9;
const EContractNotCompleted: u64 = 10;
const ENotDivisible: u64 = 11;
const EFillNotMultiple: u64 = 12;
const EInsufficientEscrow: u64 = 13;

// === Shared Types ===

/// Status of a contract. Only Open / InProgress exist as live states.
/// Completed is set when fully filled but the object has not yet been
/// garbage-collected via cleanup.
public enum ContractStatus has copy, drop, store {
    Open,
    InProgress,
    Completed,
}

// === ContractStatus Constructors ===

public fun status_open(): ContractStatus { ContractStatus::Open }
public fun status_in_progress(): ContractStatus { ContractStatus::InProgress }
public fun status_completed(): ContractStatus { ContractStatus::Completed }

// === Shared Events ===

public struct ContractFilledEvent has copy, drop {
    contract_id: ID,
    filler_id: ID,
    fill_quantity: u64,
    payout_amount: u64,
    remaining_quantity: u64,
}

public struct ContractCompletedEvent has copy, drop {
    contract_id: ID,
    poster_id: ID,
    total_filled: u64,
    total_escrow_paid: u64,
}

public struct ContractCancelledEvent has copy, drop {
    contract_id: ID,
    poster_id: ID,
    escrow_returned: u64,
    items_returned: u32,
}

public struct ContractExpiredEvent has copy, drop {
    contract_id: ID,
    poster_id: ID,
    escrow_returned: u64,
    stake_forfeited: u64,
    fill_pool_returned: u64,
    items_returned: u32,
}

// === Version ===

/// Returns the current contract version constant. Used by sibling modules
/// to stamp newly created contracts.
public(package) fun current_contract_version(): u64 { CURRENT_CONTRACT_VERSION }

// === Public(package) Helpers ===

/// Verify that a filler/courier is authorized to interact with a contract.
/// OR logic: authorized if both lists empty, or character in allowed_characters,
/// or character's in-game tribe in allowed_tribes.
public(package) fun verify_filler_access(
    allowed_characters: &vector<ID>,
    allowed_tribes: &vector<u32>,
    character: &Character,
) {
    if (allowed_characters.is_empty() && allowed_tribes.is_empty()) {
        return
    };

    let character_id = character.id();
    let tribe_id = character.tribe();
    let mut authorized = false;

    let mut i = 0;
    while (i < allowed_characters.length()) {
        if (allowed_characters[i] == character_id) {
            authorized = true;
            break
        };
        i = i + 1;
    };

    if (!authorized) {
        let mut j = 0;
        while (j < allowed_tribes.length()) {
            if (allowed_tribes[j] == tribe_id) {
                authorized = true;
                break
            };
            j = j + 1;
        };
    };

    assert!(authorized, EFillerNotAuthorized);
}

/// Add or update a filler's contribution in the fills table.
public(package) fun track_fill(
    fills: &mut Table<ID, u64>,
    filler_id: ID,
    amount: u64,
) {
    if (fills.contains(filler_id)) {
        let existing = fills.borrow_mut(filler_id);
        *existing = *existing + amount;
    } else {
        fills.add(filler_id, amount);
    };
}

/// Read a filler's total contribution from the fills table.
public(package) fun filler_contribution(
    fills: &Table<ID, u64>,
    filler_id: ID,
): u64 {
    if (fills.contains(filler_id)) {
        *fills.borrow(filler_id)
    } else {
        0
    }
}

/// Return a balance to an address as a coin, or destroy if zero.
public(package) fun return_or_destroy_balance<T>(
    balance: Balance<T>,
    addr: address,
    ctx: &mut TxContext,
) {
    if (balance.value() > 0) {
        let coin = coin::from_balance(balance, ctx);
        transfer::public_transfer(coin, addr);
    } else {
        balance.destroy_zero();
    };
}

/// Deposit an item at a destination SSU, routing to either the SSU's
/// owner inventory or the poster's player inventory.
public(package) fun deposit_to_destination(
    ssu: &mut StorageUnit,
    poster_character: &Character,
    item: inventory::Item,
    use_owner_inventory: bool,
    ctx: &mut TxContext,
) {
    if (use_owner_inventory) {
        ssu.deposit_item<CormAuth>(
            poster_character,
            item,
            corm_auth::auth(),
            ctx,
        );
    } else {
        ssu.deposit_to_owned<CormAuth>(
            poster_character,
            item,
            corm_auth::auth(),
            ctx,
        );
    };
}

/// Withdraw items from SSU open inventory and deposit to a character's
/// owned inventory. Used for releasing escrowed items.
public(package) fun release_items_to_owned(
    ssu: &mut StorageUnit,
    character: &Character,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    let item = ssu.withdraw_from_open_inventory<CormAuth>(
        character,
        corm_auth::auth(),
        type_id,
        quantity,
        ctx,
    );
    ssu.deposit_to_owned<CormAuth>(
        character,
        item,
        corm_auth::auth(),
        ctx,
    );
}

// === Event Emitters ===

public(package) fun emit_filled(
    contract_id: ID,
    filler_id: ID,
    fill_quantity: u64,
    payout_amount: u64,
    remaining_quantity: u64,
) {
    event::emit(ContractFilledEvent {
        contract_id,
        filler_id,
        fill_quantity,
        payout_amount,
        remaining_quantity,
    });
}

public(package) fun emit_completed(
    contract_id: ID,
    poster_id: ID,
    total_filled: u64,
    total_escrow_paid: u64,
) {
    event::emit(ContractCompletedEvent {
        contract_id,
        poster_id,
        total_filled,
        total_escrow_paid,
    });
}

public(package) fun emit_cancelled(
    contract_id: ID,
    poster_id: ID,
    escrow_returned: u64,
    items_returned: u32,
) {
    event::emit(ContractCancelledEvent {
        contract_id,
        poster_id,
        escrow_returned,
        items_returned,
    });
}

public(package) fun emit_expired(
    contract_id: ID,
    poster_id: ID,
    escrow_returned: u64,
    stake_forfeited: u64,
    fill_pool_returned: u64,
    items_returned: u32,
) {
    event::emit(ContractExpiredEvent {
        contract_id,
        poster_id,
        escrow_returned,
        stake_forfeited,
        fill_pool_returned,
        items_returned,
    });
}

// === Shared Assertion Helpers ===

public(package) fun assert_deadline_in_future(deadline_ms: u64, now_ms: u64) {
    assert!(deadline_ms > now_ms, EDeadlineInPast);
}

public(package) fun assert_not_expired(deadline_ms: u64, now_ms: u64) {
    assert!(now_ms <= deadline_ms, EContractExpired);
}

public(package) fun assert_expired(deadline_ms: u64, now_ms: u64) {
    assert!(now_ms > deadline_ms, EContractNotExpired);
}

public(package) fun assert_open(status: &ContractStatus) {
    assert!(*status == ContractStatus::Open, EContractNotOpen);
}

public(package) fun assert_completed(status: &ContractStatus) {
    assert!(*status == ContractStatus::Completed, EContractNotCompleted);
}

public(package) fun assert_not_self_fill(filler_id: ID, poster_id: ID) {
    assert!(filler_id != poster_id, ESelfFill);
}

public(package) fun assert_is_poster(character_id: ID, poster_id: ID) {
    assert!(character_id == poster_id, ENotPoster);
}

public(package) fun assert_not_full(remaining: u64) {
    assert!(remaining > 0, EContractFull);
}

public(package) fun assert_full_fill_if_required(allow_partial: bool, fill_amount: u64, remaining: u64) {
    if (!allow_partial) {
        assert!(fill_amount == remaining, EInsufficientFill);
    };
}

public(package) fun assert_nonzero_quantity(qty: u64) {
    assert!(qty > 0, EZeroQuantity);
}

public(package) fun assert_divisible(numerator: u64, denominator: u64) {
    assert!(numerator % denominator == 0, ENotDivisible);
}

public(package) fun assert_fill_multiple(fill_amount: u64, unit_size: u64) {
    assert!(fill_amount % unit_size == 0, EFillNotMultiple);
}

public(package) fun assert_nonzero_escrow(amount: u64) {
    assert!(amount > 0, EInsufficientEscrow);
}
