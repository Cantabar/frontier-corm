/// Transport — trustless item delivery contract with courier staking.
///
/// Poster locks coin payment and items at a source SSU. A courier accepts
/// by posting a stake, picks up items, and delivers them to the destination
/// SSU. Payment and stake are released proportionally on delivery.
/// On expiry, forfeited stake goes to poster.
module trustless_contracts::transport;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
    table::{Self, Table},
};
use corm_auth::corm_auth::{Self, CormAuth};
use world::character::Character;
use world::inventory;
use world::storage_unit::StorageUnit;
use trustless_contracts::contract_utils::{Self, ContractStatus};

// === Module-specific Errors ===
const EInsufficientStake: u64 = 100;
const ECourierAlreadyAssigned: u64 = 101;
const ENotCourier: u64 = 102;
const EContractNotInProgress: u64 = 103;
const EItemTypeMismatch: u64 = 104;
const ESourceSsuMismatch: u64 = 105;

// === Structs ===

public struct TransportContract<phantom CE, phantom CF> has key {
    id: UID,
    poster_id: ID,
    poster_address: address,
    /// Poster's locked payment released to courier on delivery.
    escrow: Balance<CE>,
    escrow_amount: u64,
    /// Courier's locked collateral.
    courier_stake: Balance<CF>,
    courier_id: Option<ID>,
    courier_address: Option<address>,
    item_type_id: u64,
    item_quantity: u32,
    source_ssu_id: ID,
    destination_ssu_id: ID,
    use_owner_inventory: bool,
    payment_amount: u64,
    stake_amount: u64,
    items_released: u32,
    target_quantity: u64,
    filled_quantity: u64,
    fills: Table<ID, u64>,
    deadline_ms: u64,
    status: ContractStatus,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
}

// === Events ===

public struct TransportCreatedEvent has copy, drop {
    contract_id: ID,
    poster_id: ID,
    item_type_id: u64,
    item_quantity: u32,
    source_ssu_id: ID,
    destination_ssu_id: ID,
    payment_amount: u64,
    stake_amount: u64,
    deadline_ms: u64,
    use_owner_inventory: bool,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
}

public struct TransportAcceptedEvent has copy, drop {
    contract_id: ID,
    courier_id: ID,
    stake_amount: u64,
}

public struct TransportDeliveredEvent has copy, drop {
    contract_id: ID,
    courier_id: ID,
    delivered_quantity: u64,
    payment_released: u64,
    stake_released: u64,
    remaining_quantity: u64,
}

// === Public Functions ===

public fun create<CE, CF>(
    character: &Character,
    escrow_coin: Coin<CE>,
    source_ssu: &mut StorageUnit,
    item: inventory::Item,
    destination_ssu_id: ID,
    required_stake: u64,
    use_owner_inventory: bool,
    deadline_ms: u64,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_deadline_in_future(deadline_ms, clock.timestamp_ms());
    let item_type_id = inventory::type_id(&item);
    let item_quantity = inventory::quantity(&item);
    contract_utils::assert_nonzero_quantity((item_quantity as u64));
    assert!(required_stake > 0, EInsufficientStake);

    let payment_amount = escrow_coin.value();
    contract_utils::assert_divisible(payment_amount, (item_quantity as u64));
    contract_utils::assert_divisible(required_stake, (item_quantity as u64));

    let poster_id = character.id();
    let poster_address = character.character_address();
    let source_ssu_id = object::id(source_ssu);

    // Lock items in open inventory (controlled by CormAuth extension)
    source_ssu.deposit_to_open_inventory<CormAuth>(
        character,
        item,
        corm_auth::auth(),
        ctx,
    );

    let contract = TransportContract<CE, CF> {
        id: object::new(ctx),
        poster_id,
        poster_address,
        escrow: escrow_coin.into_balance(),
        escrow_amount: payment_amount,
        courier_stake: balance::zero<CF>(),
        courier_id: option::none(),
        courier_address: option::none(),
        item_type_id,
        item_quantity,
        source_ssu_id,
        destination_ssu_id,
        use_owner_inventory,
        payment_amount,
        stake_amount: required_stake,
        items_released: 0,
        target_quantity: (item_quantity as u64),
        filled_quantity: 0,
        fills: table::new(ctx),
        deadline_ms,
        status: contract_utils::status_open(),
        allowed_characters,
        allowed_tribes,
    };

    let contract_id = object::id(&contract);
    event::emit(TransportCreatedEvent {
        contract_id,
        poster_id,
        item_type_id,
        item_quantity,
        source_ssu_id,
        destination_ssu_id,
        payment_amount,
        stake_amount: required_stake,
        deadline_ms,
        use_owner_inventory,
        allowed_characters: contract.allowed_characters,
        allowed_tribes: contract.allowed_tribes,
    });

    transfer::share_object(contract);
}

/// Courier accepts by locking a coin stake. Items are transferred from
/// SSU open inventory to courier's player inventory for transport.
public fun accept<CE, CF>(
    contract: &mut TransportContract<CE, CF>,
    stake_coin: Coin<CF>,
    courier_character: &Character,
    source_ssu: &mut StorageUnit,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_not_expired(contract.deadline_ms, clock.timestamp_ms());
    assert!(contract.courier_id.is_none(), ECourierAlreadyAssigned);

    let courier_id = courier_character.id();
    contract_utils::assert_not_self_fill(courier_id, contract.poster_id);
    contract_utils::verify_filler_access(
        &contract.allowed_characters,
        &contract.allowed_tribes,
        courier_character,
    );

    assert!(stake_coin.value() >= contract.stake_amount, EInsufficientStake);
    assert!(object::id(source_ssu) == contract.source_ssu_id, ESourceSsuMismatch);

    contract.courier_stake.join(stake_coin.into_balance());
    contract.courier_id = option::some(courier_id);
    contract.courier_address = option::some(courier_character.character_address());
    contract.status = contract_utils::status_in_progress();

    // Transfer items from open inventory to courier's player inventory
    contract_utils::release_items_to_owned(
        source_ssu, courier_character,
        contract.item_type_id, contract.item_quantity, ctx,
    );
    contract.items_released = contract.item_quantity;

    event::emit(TransportAcceptedEvent {
        contract_id: object::id(contract),
        courier_id,
        stake_amount: contract.courier_stake.value(),
    });
}

/// Courier delivers items to the destination SSU. Releases proportional
/// payment + stake.
public fun deliver<CE, CF>(
    contract: &mut TransportContract<CE, CF>,
    destination_ssu: &mut StorageUnit,
    courier_character: &Character,
    poster_character: &Character,
    item: inventory::Item,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(contract.status == contract_utils::status_in_progress(), EContractNotInProgress);
    contract_utils::assert_not_expired(contract.deadline_ms, clock.timestamp_ms());

    let courier_id = courier_character.id();
    assert!(contract.courier_id.contains(&courier_id), ENotCourier);
    assert!(inventory::type_id(&item) == contract.item_type_id, EItemTypeMismatch);

    let item_qty = (inventory::quantity(&item) as u64);
    contract_utils::assert_nonzero_quantity(item_qty);

    let remaining = contract.target_quantity - contract.filled_quantity;
    contract_utils::assert_not_full(remaining);

    let fill_amount = if (item_qty > remaining) { remaining } else { item_qty };

    // Deposit item at destination SSU
    contract_utils::deposit_to_destination(
        destination_ssu, poster_character, item,
        contract.use_owner_inventory, ctx,
    );

    contract_utils::track_fill(&mut contract.fills, courier_id, fill_amount);
    contract.filled_quantity = contract.filled_quantity + fill_amount;

    // Exact payment and stake return
    let is_final = (contract.filled_quantity == contract.target_quantity);
    let payment_per_item = contract.escrow_amount / contract.target_quantity;
    let stake_per_item = contract.stake_amount / contract.target_quantity;
    let payment = if (is_final) { contract.escrow.value() } else { fill_amount * payment_per_item };
    let stake_return = if (is_final) { contract.courier_stake.value() } else { fill_amount * stake_per_item };

    let contract_id = object::id(contract);
    let courier_addr = courier_character.character_address();

    if (payment > 0) {
        let payout = coin::take(&mut contract.escrow, payment, ctx);
        transfer::public_transfer(payout, courier_addr);
    };

    if (stake_return > 0) {
        let returned = coin::take(&mut contract.courier_stake, stake_return, ctx);
        transfer::public_transfer(returned, courier_addr);
    };

    event::emit(TransportDeliveredEvent {
        contract_id,
        courier_id,
        delivered_quantity: fill_amount,
        payment_released: payment,
        stake_released: stake_return,
        remaining_quantity: contract.target_quantity - contract.filled_quantity,
    });

    if (is_final) {
        contract.status = contract_utils::status_completed();
        contract_utils::emit_completed(
            contract_id, contract.poster_id,
            contract.filled_quantity, contract.escrow_amount,
        );
    };
}

/// Cancel an open transport contract. Returns items from open inventory
/// and escrow to poster.
public fun cancel<CE, CF>(
    contract: TransportContract<CE, CF>,
    poster_character: &Character,
    source_ssu: &mut StorageUnit,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_is_poster(poster_character.id(), contract.poster_id);
    assert!(object::id(source_ssu) == contract.source_ssu_id, ESourceSsuMismatch);

    let contract_id = object::id(&contract);
    let escrow_returned = contract.escrow.value();
    let items_remaining = contract.item_quantity - contract.items_released;
    let item_type = contract.item_type_id;

    let TransportContract {
        id,
        poster_id,
        poster_address,
        escrow,
        courier_stake,
        fills,
        ..
    } = contract;

    if (items_remaining > 0) {
        contract_utils::release_items_to_owned(
            source_ssu, poster_character,
            item_type, items_remaining, ctx,
        );
    };

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    courier_stake.destroy_zero();

    contract_utils::emit_cancelled(contract_id, poster_id, escrow_returned, items_remaining);

    fills.drop();
    id.delete();
}

/// Expire after deadline. Escrow → poster. Stake → poster (forfeited).
/// Items remain with courier (already released on accept).
public fun expire<CE, CF>(
    contract: TransportContract<CE, CF>,
    poster_character: &Character,
    source_ssu: &mut StorageUnit,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_expired(contract.deadline_ms, clock.timestamp_ms());
    assert!(object::id(source_ssu) == contract.source_ssu_id, ESourceSsuMismatch);

    let contract_id = object::id(&contract);
    let escrow_returned = contract.escrow.value();
    let stake_forfeited = contract.courier_stake.value();

    // Items remaining in open inventory (not yet picked up by courier)
    let items_remaining = contract.item_quantity - contract.items_released;
    let item_type = contract.item_type_id;

    let TransportContract {
        id,
        poster_id,
        poster_address,
        escrow,
        courier_stake,
        fills,
        ..
    } = contract;

    if (items_remaining > 0) {
        contract_utils::release_items_to_owned(
            source_ssu, poster_character,
            item_type, items_remaining, ctx,
        );
    };

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::return_or_destroy_balance(courier_stake, poster_address, ctx);

    contract_utils::emit_expired(
        contract_id, poster_id, escrow_returned,
        stake_forfeited, 0, items_remaining,
    );

    fills.drop();
    id.delete();
}

/// Garbage-collect a completed transport contract.
public fun cleanup<CE, CF>(
    contract: TransportContract<CE, CF>,
    ctx: &mut TxContext,
) {
    contract_utils::assert_completed(&contract.status);

    let TransportContract {
        id,
        poster_address,
        escrow,
        courier_stake,
        fills,
        ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::return_or_destroy_balance(courier_stake, poster_address, ctx);

    fills.drop();
    id.delete();
}

// === View Functions ===

public fun poster_id<CE, CF>(c: &TransportContract<CE, CF>): ID { c.poster_id }
public fun poster_address<CE, CF>(c: &TransportContract<CE, CF>): address { c.poster_address }
public fun escrow_amount<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.escrow_amount }
public fun escrow_balance<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.escrow.value() }
public fun courier_stake_balance<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.courier_stake.value() }
public fun courier_id<CE, CF>(c: &TransportContract<CE, CF>): Option<ID> { c.courier_id }
public fun courier_address<CE, CF>(c: &TransportContract<CE, CF>): Option<address> { c.courier_address }
public fun item_type_id<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.item_type_id }
public fun item_quantity<CE, CF>(c: &TransportContract<CE, CF>): u32 { c.item_quantity }
public fun source_ssu_id<CE, CF>(c: &TransportContract<CE, CF>): ID { c.source_ssu_id }
public fun destination_ssu_id<CE, CF>(c: &TransportContract<CE, CF>): ID { c.destination_ssu_id }
public fun use_owner_inventory<CE, CF>(c: &TransportContract<CE, CF>): bool { c.use_owner_inventory }
public fun payment_amount<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.payment_amount }
public fun stake_amount<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.stake_amount }
public fun items_released<CE, CF>(c: &TransportContract<CE, CF>): u32 { c.items_released }
public fun target_quantity<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.target_quantity }
public fun filled_quantity<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.filled_quantity }
public fun deadline_ms<CE, CF>(c: &TransportContract<CE, CF>): u64 { c.deadline_ms }
public fun status<CE, CF>(c: &TransportContract<CE, CF>): ContractStatus { c.status }
public fun allowed_characters<CE, CF>(c: &TransportContract<CE, CF>): vector<ID> { c.allowed_characters }
public fun allowed_tribes<CE, CF>(c: &TransportContract<CE, CF>): vector<u32> { c.allowed_tribes }

public fun filler_contribution<CE, CF>(c: &TransportContract<CE, CF>, filler_id: ID): u64 {
    contract_utils::filler_contribution(&c.fills, filler_id)
}

// === Test-only Helpers ===

#[test_only]
public fun destroy_for_testing<CE, CF>(contract: TransportContract<CE, CF>) {
    let TransportContract { id, escrow, courier_stake, fills, .. } = contract;
    escrow.destroy_for_testing();
    courier_stake.destroy_for_testing();
    fills.drop();
    id.delete();
}
