# Multi-Input Item Support for Trustless Contracts

**Status:** Tabled — exploratory analysis only

## Problem
The four item-involving contract types (ItemForCoin, CoinForItem, ItemForItem, Transport) each accept a single item type. Allowing multiple item types per contract would enable richer trade scenarios (e.g., offering a bundle of different items for coins).

## Current Coverage
`multi_input_contract` already generalizes the CoinForItem case — poster escrows coins, specifies N material slots (type_id → required quantity), fillers deliver matching items for proportional bounty. This covers the "multiple wanted item types" scenario.

The remaining gaps are multi-input on the **offer** side:
- **ItemForCoin**: poster locks multiple item types, wants coins
- **ItemForItem**: multiple types on both offer and want sides
- **Transport**: courier moves multiple item types between SSUs

## Per-Contract-Type Overhead

### ItemForCoin (multiple offered types → coins)
- Requires per-type pricing vectors or a unified weight system to determine how coins map to heterogeneous items
- Creation: N `deposit_to_open_inventory` calls (one per offered type)
- Cancel/expire: N `withdraw_from_open_inventory` + N `deposit_to_owned` calls
- Partial fill release must decide which offered type(s) to release proportionally
- **Complexity: ~2-3x current code**

### ItemForItem (multiple types on both sides)
- Two `Table<u64, SlotState>` structures (offer slots + want slots)
- Cross-product logic: filling want slot X must release proportional items from the offered pool
- Divisibility guards multiply — each offered type's quantity must be divisible by total wanted units
- **Complexity: ~3-4x current code**

### Transport (multiple item types to move)
- Relatively straightforward: poster locks N types at source, courier picks up all, delivers all
- Payment/stake math stays simple (per-total-unit)
- Courier must handle N items at both pickup and delivery (N withdraw + N deposit calls)
- **Complexity: ~1.5-2x current code**

## Gas & Storage Overhead (per additional item type)
- **Storage**: ~60-80 bytes per slot entry (Table entry + SlotState) + 8 bytes in type_ids vector
- **Gas at creation**: +1 `deposit_to_open_inventory` call per offered type (~2,000-5,000 gas units)
- **Gas at cancel/expire**: +1 withdraw + deposit per remaining offered type
- **Gas per fill**: Table lookup is O(1), but multi-type release adds ~1,500-3,000 gas per released type
- **Typical 3-5 slot contract vs single-item**: ~30-60% more gas per transaction, ~300-500 bytes more storage

## Possible Approaches

### A. Compose at the PTB level (no on-chain changes)
Poster creates N separate single-item contracts grouped by a shared tag/ID. Frontend bundles them in one PTB. Zero on-chain overhead, but no atomicity guarantee across the group.

### B. New `MultiOutputContract` module
Mirror of `multi_input_contract` for the offer side: poster locks multiple item types with per-type pricing, wants coins. Keeps `trustless_contracts` untouched.

### C. Extend trustless_contracts in-place
Replace scalar type_id/quantity fields with Tables and vectors. Highest risk — touches all creation, fill, cancel, expire, and cleanup paths.

## Recommendation
Option B (new `MultiOutputContract`) is the cleanest path if this is pursued — it avoids destabilizing the existing trustless contracts and mirrors the proven `multi_input_contract` pattern.
