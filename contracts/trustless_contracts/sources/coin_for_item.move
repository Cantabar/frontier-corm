/// CoinForItem — trustless coin-for-item exchange with escrow.
///
/// Poster locks Coin<CE> as escrow, wants items deposited at a destination SSU.
/// Fillers deliver matching items and receive proportional CE.
///
/// When `use_owner_inventory` is true, filled items go to the SSU's main
/// owner inventory instead of the poster's player inventory.
module trustless_contracts::coin_for_item;

use sui::{
    balance::Balance,
    clock::Clock,
    coin::{Self, Coin},
    event,
    table::{Self, Table},
};
use world::character::Character;
use world::inventory;
use world::storage_unit::StorageUnit;
use trustless_contracts::contract_utils::{Self, ContractStatus};

// === Module-specific Errors ===
const EItemTypeMismatch: u64 = 100;

// === Structs ===

public struct CoinForItemContract<phantom CE, phantom CF> has key {
    id: UID,
    poster_id: ID,
    poster_address: address,
    escrow: Balance<CE>,
    escrow_amount: u64,
    wanted_type_id: u64,
    wanted_quantity: u32,
    destination_ssu_id: ID,
    use_owner_inventory: bool,
    target_quantity: u64,
    filled_quantity: u64,
    allow_partial: bool,
    fills: Table<ID, u64>,
    deadline_ms: u64,
    status: ContractStatus,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
}

// === Events ===

public struct CoinForItemCreatedEvent has copy, drop {
    contract_id: ID,
    poster_id: ID,
    escrow_amount: u64,
    wanted_type_id: u64,
    wanted_quantity: u32,
    destination_ssu_id: ID,
    target_quantity: u64,
    deadline_ms: u64,
    allow_partial: bool,
    use_owner_inventory: bool,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
}

// === Public Functions ===

public fun create<CE, CF>(
    character: &Character,
    escrow_coin: Coin<CE>,
    wanted_type_id: u64,
    wanted_quantity: u32,
    destination_ssu_id: ID,
    allow_partial: bool,
    use_owner_inventory: bool,
    deadline_ms: u64,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_deadline_in_future(deadline_ms, clock.timestamp_ms());
    contract_utils::assert_nonzero_quantity((wanted_quantity as u64));

    let offered_amount = escrow_coin.value();
    if (allow_partial) {
        contract_utils::assert_divisible(offered_amount, (wanted_quantity as u64));
    };

    let poster_id = character.id();
    let poster_address = character.character_address();

    let contract = CoinForItemContract<CE, CF> {
        id: object::new(ctx),
        poster_id,
        poster_address,
        escrow: escrow_coin.into_balance(),
        escrow_amount: offered_amount,
        wanted_type_id,
        wanted_quantity,
        destination_ssu_id,
        use_owner_inventory,
        target_quantity: (wanted_quantity as u64),
        filled_quantity: 0,
        allow_partial,
        fills: table::new(ctx),
        deadline_ms,
        status: contract_utils::status_open(),
        allowed_characters,
        allowed_tribes,
    };

    let contract_id = object::id(&contract);
    event::emit(CoinForItemCreatedEvent {
        contract_id,
        poster_id,
        escrow_amount: offered_amount,
        wanted_type_id,
        wanted_quantity,
        destination_ssu_id,
        target_quantity: (wanted_quantity as u64),
        deadline_ms,
        allow_partial,
        use_owner_inventory,
        allowed_characters: contract.allowed_characters,
        allowed_tribes: contract.allowed_tribes,
    });

    transfer::share_object(contract);
}

/// Fill by depositing items at the destination SSU. Filler receives
/// proportional coin escrow.
public fun fill<CE, CF>(
    contract: &mut CoinForItemContract<CE, CF>,
    destination_ssu: &mut StorageUnit,
    poster_character: &Character,
    filler_character: &Character,
    item: inventory::Item,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_not_expired(contract.deadline_ms, clock.timestamp_ms());

    let filler_id = filler_character.id();
    contract_utils::assert_not_self_fill(filler_id, contract.poster_id);
    contract_utils::verify_filler_access(
        &contract.allowed_characters,
        &contract.allowed_tribes,
        filler_character,
    );

    assert!(inventory::type_id(&item) == contract.wanted_type_id, EItemTypeMismatch);

    let item_qty = (inventory::quantity(&item) as u64);
    contract_utils::assert_nonzero_quantity(item_qty);

    let remaining = contract.target_quantity - contract.filled_quantity;
    contract_utils::assert_not_full(remaining);

    let fill_amount = if (item_qty > remaining) { remaining } else { item_qty };
    contract_utils::assert_full_fill_if_required(
        contract.allow_partial, fill_amount, remaining,
    );

    // Deposit item at destination SSU
    contract_utils::deposit_to_destination(
        destination_ssu, poster_character, item,
        contract.use_owner_inventory, ctx,
    );

    contract_utils::track_fill(&mut contract.fills, filler_id, fill_amount);
    contract.filled_quantity = contract.filled_quantity + fill_amount;

    // Calculate escrow payout. Final fill drains all remaining escrow.
    let is_final = (contract.filled_quantity == contract.target_quantity);
    let payout_amount = if (is_final) {
        contract.escrow.value()
    } else {
        let unit_price = contract.escrow_amount / contract.target_quantity;
        fill_amount * unit_price
    };

    let contract_id = object::id(contract);

    if (payout_amount > 0) {
        let payout = coin::take(&mut contract.escrow, payout_amount, ctx);
        transfer::public_transfer(payout, filler_character.character_address());
    };

    contract_utils::emit_filled(
        contract_id, filler_id, fill_amount, payout_amount,
        contract.target_quantity - contract.filled_quantity,
    );

    if (is_final) {
        contract.status = contract_utils::status_completed();
        contract_utils::emit_completed(
            contract_id, contract.poster_id,
            contract.filled_quantity, contract.escrow_amount,
        );
    };
}

/// Cancel an open contract. Returns remaining escrow to poster.
public fun cancel<CE, CF>(
    contract: CoinForItemContract<CE, CF>,
    poster_character: &Character,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_is_poster(poster_character.id(), contract.poster_id);

    let contract_id = object::id(&contract);
    let escrow_returned = contract.escrow.value();

    let CoinForItemContract {
        id, poster_id, poster_address, escrow, fills, ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::emit_cancelled(contract_id, poster_id, escrow_returned, 0);

    fills.drop();
    id.delete();
}

/// Expire after deadline. Anyone can call.
public fun expire<CE, CF>(
    contract: CoinForItemContract<CE, CF>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_expired(contract.deadline_ms, clock.timestamp_ms());

    let contract_id = object::id(&contract);
    let escrow_returned = contract.escrow.value();

    let CoinForItemContract {
        id, poster_id, poster_address, escrow, fills, ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::emit_expired(
        contract_id, poster_id, escrow_returned, 0, 0, 0,
    );

    fills.drop();
    id.delete();
}

/// Garbage-collect a completed contract.
public fun cleanup<CE, CF>(
    contract: CoinForItemContract<CE, CF>,
    ctx: &mut TxContext,
) {
    contract_utils::assert_completed(&contract.status);

    let CoinForItemContract {
        id, poster_address, escrow, fills, ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    fills.drop();
    id.delete();
}

// === View Functions ===

public fun poster_id<CE, CF>(c: &CoinForItemContract<CE, CF>): ID { c.poster_id }
public fun poster_address<CE, CF>(c: &CoinForItemContract<CE, CF>): address { c.poster_address }
public fun escrow_amount<CE, CF>(c: &CoinForItemContract<CE, CF>): u64 { c.escrow_amount }
public fun escrow_balance<CE, CF>(c: &CoinForItemContract<CE, CF>): u64 { c.escrow.value() }
public fun wanted_type_id<CE, CF>(c: &CoinForItemContract<CE, CF>): u64 { c.wanted_type_id }
public fun wanted_quantity<CE, CF>(c: &CoinForItemContract<CE, CF>): u32 { c.wanted_quantity }
public fun destination_ssu_id<CE, CF>(c: &CoinForItemContract<CE, CF>): ID { c.destination_ssu_id }
public fun use_owner_inventory<CE, CF>(c: &CoinForItemContract<CE, CF>): bool { c.use_owner_inventory }
public fun target_quantity<CE, CF>(c: &CoinForItemContract<CE, CF>): u64 { c.target_quantity }
public fun filled_quantity<CE, CF>(c: &CoinForItemContract<CE, CF>): u64 { c.filled_quantity }
public fun allow_partial<CE, CF>(c: &CoinForItemContract<CE, CF>): bool { c.allow_partial }
public fun deadline_ms<CE, CF>(c: &CoinForItemContract<CE, CF>): u64 { c.deadline_ms }
public fun status<CE, CF>(c: &CoinForItemContract<CE, CF>): ContractStatus { c.status }
public fun allowed_characters<CE, CF>(c: &CoinForItemContract<CE, CF>): vector<ID> { c.allowed_characters }
public fun allowed_tribes<CE, CF>(c: &CoinForItemContract<CE, CF>): vector<u32> { c.allowed_tribes }

public fun filler_contribution<CE, CF>(c: &CoinForItemContract<CE, CF>, filler_id: ID): u64 {
    contract_utils::filler_contribution(&c.fills, filler_id)
}

// === Test-only Helpers ===

#[test_only]
public fun destroy_for_testing<CE, CF>(contract: CoinForItemContract<CE, CF>) {
    let CoinForItemContract { id, escrow, fills, .. } = contract;
    escrow.destroy_for_testing();
    fills.drop();
    id.delete();
}
