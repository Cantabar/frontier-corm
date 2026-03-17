/// CoinForCoin — trustless coin-for-coin exchange with escrow.
///
/// Poster locks Coin<CE> as escrow, wants Coin<CF> in return.
/// Fillers pay CF and receive proportional CE. Supports partial fills.
///
/// Special case: when `wanted_amount = 0`, the contract becomes a free
/// giveaway. `target_quantity` tracks escrow distributed instead.
module trustless_contracts::coin_for_coin;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
    table::{Self, Table},
};
use world::character::Character;
use trustless_contracts::contract_utils::{Self, ContractStatus};

// === Module-specific Errors ===
const EWantedAmountZero: u64 = 100;

// === Structs ===

public struct CoinForCoinContract<phantom CE, phantom CF> has key {
    id: UID,
    poster_id: ID,
    poster_address: address,
    /// Poster's locked coins released proportionally to fillers.
    escrow: Balance<CE>,
    /// Original escrow amount (immutable, used for payout math).
    escrow_amount: u64,
    /// Accumulated filler payments forwarded to poster.
    fill_pool: Balance<CF>,
    offered_amount: u64,
    wanted_amount: u64,
    /// Total units to fill (wanted_amount, or offered_amount for free giveaways).
    target_quantity: u64,
    filled_quantity: u64,
    allow_partial: bool,
    /// Filler Character ID → quantity contributed.
    fills: Table<ID, u64>,
    deadline_ms: u64,
    status: ContractStatus,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
}

// === Events ===

public struct CoinForCoinCreatedEvent has copy, drop {
    contract_id: ID,
    poster_id: ID,
    offered_amount: u64,
    wanted_amount: u64,
    target_quantity: u64,
    deadline_ms: u64,
    allow_partial: bool,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
}

// === Public Functions ===

/// Create a CoinForCoin contract. Poster locks Coin<CE>, wants Coin<CF>.
public fun create<CE, CF>(
    character: &Character,
    escrow_coin: Coin<CE>,
    wanted_amount: u64,
    allow_partial: bool,
    deadline_ms: u64,
    allowed_characters: vector<ID>,
    allowed_tribes: vector<u32>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_deadline_in_future(deadline_ms, clock.timestamp_ms());

    let offered_amount = escrow_coin.value();
    assert!(offered_amount > 0 || wanted_amount > 0, EWantedAmountZero);

    if (allow_partial && offered_amount > 0 && wanted_amount > 0) {
        contract_utils::assert_divisible(offered_amount, wanted_amount);
    };

    let poster_id = character.id();
    let poster_address = character.character_address();

    let effective_target = if (wanted_amount == 0) {
        offered_amount
    } else {
        wanted_amount
    };

    let contract = CoinForCoinContract<CE, CF> {
        id: object::new(ctx),
        poster_id,
        poster_address,
        escrow: escrow_coin.into_balance(),
        escrow_amount: offered_amount,
        fill_pool: balance::zero<CF>(),
        offered_amount,
        wanted_amount,
        target_quantity: effective_target,
        filled_quantity: 0,
        allow_partial,
        fills: table::new(ctx),
        deadline_ms,
        status: contract_utils::status_open(),
        allowed_characters,
        allowed_tribes,
    };

    let contract_id = object::id(&contract);
    event::emit(CoinForCoinCreatedEvent {
        contract_id,
        poster_id,
        offered_amount,
        wanted_amount,
        target_quantity: effective_target,
        deadline_ms,
        allow_partial,
        allowed_characters: contract.allowed_characters,
        allowed_tribes: contract.allowed_tribes,
    });

    transfer::share_object(contract);
}

/// Fill a CoinForCoin contract. Filler pays Coin<CF>, receives proportional
/// Coin<CE> from escrow. Filler's payment forwarded to poster.
public fun fill<CE, CF>(
    contract: &mut CoinForCoinContract<CE, CF>,
    mut fill_coin: Coin<CF>,
    filler_character: &Character,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_not_expired(contract.deadline_ms, clock.timestamp_ms());
    contract_utils::assert_nonzero_escrow(fill_coin.value());

    let filler_id = filler_character.id();
    contract_utils::assert_not_self_fill(filler_id, contract.poster_id);
    contract_utils::verify_filler_access(
        &contract.allowed_characters,
        &contract.allowed_tribes,
        filler_character,
    );

    let remaining = contract.target_quantity - contract.filled_quantity;
    contract_utils::assert_not_full(remaining);

    let fill_amount = if (fill_coin.value() > remaining) {
        remaining
    } else {
        fill_coin.value()
    };

    contract_utils::assert_full_fill_if_required(
        contract.allow_partial, fill_amount, remaining,
    );

    // Return excess to filler
    if (fill_coin.value() > fill_amount) {
        let excess_amount = fill_coin.value() - fill_amount;
        let excess = fill_coin.split(excess_amount, ctx);
        transfer::public_transfer(excess, filler_character.character_address());
    };

    contract.fill_pool.join(fill_coin.into_balance());
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

    // Release escrow to filler
    if (payout_amount > 0) {
        let payout = coin::take(&mut contract.escrow, payout_amount, ctx);
        transfer::public_transfer(payout, filler_character.character_address());
    };

    // Release filler's payment to poster
    if (fill_amount > 0) {
        let poster_payout = coin::take(&mut contract.fill_pool, fill_amount, ctx);
        transfer::public_transfer(poster_payout, contract.poster_address);
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

/// Claim coins from a free CoinForCoin contract (wanted_amount = 0).
/// No fill coin required.
public fun claim_free<CE, CF>(
    contract: &mut CoinForCoinContract<CE, CF>,
    filler_character: &Character,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_not_expired(contract.deadline_ms, clock.timestamp_ms());
    assert!(contract.wanted_amount == 0, EWantedAmountZero);
    contract_utils::assert_nonzero_quantity(amount);

    let filler_id = filler_character.id();
    contract_utils::assert_not_self_fill(filler_id, contract.poster_id);
    contract_utils::verify_filler_access(
        &contract.allowed_characters,
        &contract.allowed_tribes,
        filler_character,
    );

    let remaining = contract.target_quantity - contract.filled_quantity;
    contract_utils::assert_not_full(remaining);

    let claim_amount = if (amount > remaining) { remaining } else { amount };
    contract_utils::assert_full_fill_if_required(
        contract.allow_partial, claim_amount, remaining,
    );

    contract_utils::track_fill(&mut contract.fills, filler_id, claim_amount);
    contract.filled_quantity = contract.filled_quantity + claim_amount;

    // Release proportional escrow
    let payout = if (claim_amount > contract.escrow.value()) {
        contract.escrow.value()
    } else {
        claim_amount
    };
    if (payout > 0) {
        let coin = coin::take(&mut contract.escrow, payout, ctx);
        transfer::public_transfer(coin, filler_character.character_address());
    };

    let contract_id = object::id(contract);

    contract_utils::emit_filled(
        contract_id, filler_id, claim_amount, payout,
        contract.target_quantity - contract.filled_quantity,
    );

    if (contract.filled_quantity == contract.target_quantity) {
        // Return any rounding dust to poster
        let dust = contract.escrow.value();
        if (dust > 0) {
            let dust_coin = coin::take(&mut contract.escrow, dust, ctx);
            transfer::public_transfer(dust_coin, contract.poster_address);
        };

        contract.status = contract_utils::status_completed();
        contract_utils::emit_completed(
            contract_id, contract.poster_id,
            contract.filled_quantity, contract.escrow_amount,
        );
    };
}

/// Cancel an open contract. Returns remaining escrow to poster.
public fun cancel<CE, CF>(
    contract: CoinForCoinContract<CE, CF>,
    poster_character: &Character,
    ctx: &mut TxContext,
) {
    contract_utils::assert_open(&contract.status);
    contract_utils::assert_is_poster(poster_character.id(), contract.poster_id);

    let contract_id = object::id(&contract);
    let escrow_returned = contract.escrow.value();

    let CoinForCoinContract {
        id,
        poster_id,
        poster_address,
        escrow,
        fill_pool,
        fills,
        ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::return_or_destroy_balance(fill_pool, poster_address, ctx);

    contract_utils::emit_cancelled(contract_id, poster_id, escrow_returned, 0);

    fills.drop();
    id.delete();
}

/// Expire a contract after its deadline. Anyone can call this.
public fun expire<CE, CF>(
    contract: CoinForCoinContract<CE, CF>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    contract_utils::assert_expired(contract.deadline_ms, clock.timestamp_ms());

    let contract_id = object::id(&contract);
    let escrow_returned = contract.escrow.value();
    let fill_pool_returned = contract.fill_pool.value();

    let CoinForCoinContract {
        id,
        poster_id,
        poster_address,
        escrow,
        fill_pool,
        fills,
        ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::return_or_destroy_balance(fill_pool, poster_address, ctx);

    contract_utils::emit_expired(
        contract_id, poster_id, escrow_returned, 0, fill_pool_returned, 0,
    );

    fills.drop();
    id.delete();
}

/// Garbage-collect a completed contract. Anyone can call this.
public fun cleanup<CE, CF>(
    contract: CoinForCoinContract<CE, CF>,
    ctx: &mut TxContext,
) {
    contract_utils::assert_completed(&contract.status);

    let CoinForCoinContract {
        id,
        poster_address,
        escrow,
        fill_pool,
        fills,
        ..
    } = contract;

    contract_utils::return_or_destroy_balance(escrow, poster_address, ctx);
    contract_utils::return_or_destroy_balance(fill_pool, poster_address, ctx);

    fills.drop();
    id.delete();
}

// === View Functions ===

public fun poster_id<CE, CF>(c: &CoinForCoinContract<CE, CF>): ID { c.poster_id }
public fun poster_address<CE, CF>(c: &CoinForCoinContract<CE, CF>): address { c.poster_address }
public fun escrow_amount<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.escrow_amount }
public fun escrow_balance<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.escrow.value() }
public fun fill_pool_balance<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.fill_pool.value() }
public fun offered_amount<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.offered_amount }
public fun wanted_amount<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.wanted_amount }
public fun target_quantity<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.target_quantity }
public fun filled_quantity<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.filled_quantity }
public fun allow_partial<CE, CF>(c: &CoinForCoinContract<CE, CF>): bool { c.allow_partial }
public fun deadline_ms<CE, CF>(c: &CoinForCoinContract<CE, CF>): u64 { c.deadline_ms }
public fun status<CE, CF>(c: &CoinForCoinContract<CE, CF>): ContractStatus { c.status }
public fun allowed_characters<CE, CF>(c: &CoinForCoinContract<CE, CF>): vector<ID> { c.allowed_characters }
public fun allowed_tribes<CE, CF>(c: &CoinForCoinContract<CE, CF>): vector<u32> { c.allowed_tribes }

public fun filler_contribution<CE, CF>(c: &CoinForCoinContract<CE, CF>, filler_id: ID): u64 {
    contract_utils::filler_contribution(&c.fills, filler_id)
}

// === Test-only Helpers ===

#[test_only]
public fun destroy_for_testing<CE, CF>(contract: CoinForCoinContract<CE, CF>) {
    let CoinForCoinContract { id, escrow, fill_pool, fills, .. } = contract;
    escrow.destroy_for_testing();
    fill_pool.destroy_for_testing();
    fills.drop();
    id.delete();
}
