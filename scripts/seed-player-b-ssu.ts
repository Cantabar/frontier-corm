/**
 * seed-player-b-ssu.ts
 *
 * Creates a Network Node and an empty SSU for Player B.
 * Run after world-contracts seed-world.sh has completed (Player B character must exist).
 *
 * Designed to run from the world-contracts directory so that dotenv/config
 * loads the correct .env and extracted object IDs resolve from deployments/.
 *
 * Usage (from frontier-corm):
 *   cd ../world-contracts && NODE_PATH=$PWD/node_modules npx tsx ../frontier-corm/scripts/seed-player-b-ssu.ts
 */
import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { MODULES } from "../../world-contracts/ts-scripts/utils/config";
import { deriveObjectId } from "../../world-contracts/ts-scripts/utils/derive-object-id";
import {
    hydrateWorldConfig,
    initializeContext,
    handleError,
    extractEvent,
    hexToBytes,
    getEnvConfig,
    shareHydratedConfig,
    requireEnv,
} from "../../world-contracts/ts-scripts/utils/helper";
import { executeSponsoredTransaction } from "../../world-contracts/ts-scripts/utils/transaction";
import {
    CLOCK_OBJECT_ID,
    GAME_CHARACTER_B_ID,
    LOCATION_HASH,
    NWN_TYPE_ID,
    STORAGE_A_TYPE_ID,
} from "../../world-contracts/ts-scripts/utils/constants";
import { getOwnerCap as getNwnOwnerCap } from "../../world-contracts/ts-scripts/network-node/helper";
import { getOwnerCap as getSsuOwnerCap } from "../../world-contracts/ts-scripts/storage-unit/helper";
import { delay, getDelayMs } from "../../world-contracts/ts-scripts/utils/delay";

// ---------------------------------------------------------------------------
// Player B-specific item IDs (must not collide with Player A's IDs)
// ---------------------------------------------------------------------------
const NWN_B_ITEM_ID = 5550000013n; // Player A's is 5550000012
const STORAGE_B_ITEM_ID = 888800007n; // Player A's is 888800006

// NWN parameters (same as Player A)
const FUEL_MAX_CAPACITY = 10000n;
const FUEL_BURN_RATE_IN_MS = BigInt(3600 * 1000); // 1 hour
const MAX_ENERGY_PRODUCTION = 100n;
const FUEL_TYPE_ID = 78437n;
const FUEL_QUANTITY = 2n;
const FUEL_VOLUME = 10n;

// SSU parameters
const SSU_MAX_CAPACITY = 1000000000000n;

async function main() {
    try {
        // ── Initialise contexts ────────────────────────────────────
        const env = getEnvConfig();
        const adminCtx = initializeContext(env.network, env.adminExportedKey);
        await hydrateWorldConfig(adminCtx);

        const playerKey = requireEnv("PLAYER_B_PRIVATE_KEY");
        const playerCtx = initializeContext(env.network, playerKey);
        shareHydratedConfig(adminCtx, playerCtx);

        const { client, keypair: adminKeypair, config } = adminCtx;
        const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
        const playerAddress = playerCtx.address;

        const characterB = deriveObjectId(
            config.objectRegistry,
            GAME_CHARACTER_B_ID,
            config.packageId,
        );

        const DELAY = getDelayMs();

        // ── 1. Anchor NWN for Player B ─────────────────────────────
        console.log("\n==== [Player B] Anchoring Network Node ====");
        console.log(`Character: ${characterB}`);
        console.log(`NWN ItemId: ${NWN_B_ITEM_ID}`);

        const anchorNwnTx = new Transaction();

        const [nwn] = anchorNwnTx.moveCall({
            target: `${config.packageId}::${MODULES.NETWORK_NODE}::anchor`,
            arguments: [
                anchorNwnTx.object(config.objectRegistry),
                anchorNwnTx.object(characterB),
                anchorNwnTx.object(config.adminAcl),
                anchorNwnTx.pure.u64(NWN_B_ITEM_ID),
                anchorNwnTx.pure.u64(NWN_TYPE_ID),
                anchorNwnTx.pure(bcs.vector(bcs.u8()).serialize(hexToBytes(LOCATION_HASH))),
                anchorNwnTx.pure.u64(FUEL_MAX_CAPACITY),
                anchorNwnTx.pure.u64(FUEL_BURN_RATE_IN_MS),
                anchorNwnTx.pure.u64(MAX_ENERGY_PRODUCTION),
            ],
        });

        anchorNwnTx.moveCall({
            target: `${config.packageId}::${MODULES.NETWORK_NODE}::share_network_node`,
            arguments: [nwn, anchorNwnTx.object(config.adminAcl)],
        });

        const nwnResult = await client.signAndExecuteTransaction({
            transaction: anchorNwnTx,
            signer: adminKeypair,
            options: { showEvents: true },
        });

        const nwnEvent = extractEvent<{ network_node_id: string; owner_cap_id: string }>(
            nwnResult,
            "::network_node::NetworkNodeCreatedEvent",
        );
        if (!nwnEvent) throw new Error("NetworkNodeCreatedEvent not found");

        console.log(`NWN created: ${nwnEvent.network_node_id}`);
        console.log(`NWN OwnerCap: ${nwnEvent.owner_cap_id}`);

        await delay(DELAY);

        // ── 2. Deposit fuel to NWN (Player B signs, admin sponsors) ─
        console.log("\n==== [Player B] Depositing fuel to NWN ====");

        const nwnObjectId = deriveObjectId(config.objectRegistry, NWN_B_ITEM_ID, config.packageId);

        const nwnOwnerCap = await getNwnOwnerCap(nwnObjectId, client, config, playerAddress);
        if (!nwnOwnerCap) throw new Error(`NWN OwnerCap not found for ${nwnObjectId}`);

        const fuelTx = new Transaction();
        fuelTx.setSender(playerAddress);
        fuelTx.setGasOwner(adminAddress);

        const [borrowedNwnCap, nwnReceipt] = fuelTx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::borrow_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.NETWORK_NODE}::NetworkNode`],
            arguments: [fuelTx.object(characterB), fuelTx.object(nwnOwnerCap)],
        });

        fuelTx.moveCall({
            target: `${config.packageId}::${MODULES.NETWORK_NODE}::deposit_fuel`,
            arguments: [
                fuelTx.object(nwnObjectId),
                fuelTx.object(config.adminAcl),
                borrowedNwnCap,
                fuelTx.pure.u64(FUEL_TYPE_ID),
                fuelTx.pure.u64(FUEL_VOLUME),
                fuelTx.pure.u64(FUEL_QUANTITY),
                fuelTx.object(CLOCK_OBJECT_ID),
            ],
        });

        fuelTx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::return_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.NETWORK_NODE}::NetworkNode`],
            arguments: [fuelTx.object(characterB), borrowedNwnCap, nwnReceipt],
        });

        const fuelResult = await executeSponsoredTransaction(
            fuelTx,
            client,
            playerCtx.keypair,
            adminKeypair,
            playerAddress,
            adminAddress,
        );
        console.log(`Fuel deposited — digest: ${fuelResult.digest}`);

        await delay(DELAY);

        // ── 3. Bring NWN online (Player B signs) ───────────────────
        console.log("\n==== [Player B] Bringing NWN online ====");

        const onlineNwnTx = new Transaction();

        const [onlineNwnCap, onlineNwnReceipt] = onlineNwnTx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::borrow_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.NETWORK_NODE}::NetworkNode`],
            arguments: [onlineNwnTx.object(characterB), onlineNwnTx.object(nwnOwnerCap)],
        });

        onlineNwnTx.moveCall({
            target: `${config.packageId}::${MODULES.NETWORK_NODE}::online`,
            arguments: [
                onlineNwnTx.object(nwnObjectId),
                onlineNwnCap,
                onlineNwnTx.object(CLOCK_OBJECT_ID),
            ],
        });

        onlineNwnTx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::return_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.NETWORK_NODE}::NetworkNode`],
            arguments: [onlineNwnTx.object(characterB), onlineNwnCap, onlineNwnReceipt],
        });

        const onlineNwnResult = await client.signAndExecuteTransaction({
            transaction: onlineNwnTx,
            signer: playerCtx.keypair,
            options: { showEffects: true },
        });
        console.log(`NWN online — digest: ${onlineNwnResult.digest}`);

        await delay(DELAY);

        // ── 4. Anchor SSU linked to Player B's NWN ─────────────────
        console.log("\n==== [Player B] Anchoring Storage Unit ====");
        console.log(`SSU ItemId: ${STORAGE_B_ITEM_ID}`);

        const anchorSsuTx = new Transaction();

        const [ssu] = anchorSsuTx.moveCall({
            target: `${config.packageId}::${MODULES.STORAGE_UNIT}::anchor`,
            arguments: [
                anchorSsuTx.object(config.objectRegistry),
                anchorSsuTx.object(nwnObjectId),
                anchorSsuTx.object(characterB),
                anchorSsuTx.object(config.adminAcl),
                anchorSsuTx.pure.u64(STORAGE_B_ITEM_ID),
                anchorSsuTx.pure.u64(STORAGE_A_TYPE_ID),
                anchorSsuTx.pure.u64(SSU_MAX_CAPACITY),
                anchorSsuTx.pure(bcs.vector(bcs.u8()).serialize(hexToBytes(LOCATION_HASH))),
            ],
        });

        anchorSsuTx.moveCall({
            target: `${config.packageId}::${MODULES.STORAGE_UNIT}::share_storage_unit`,
            arguments: [ssu, anchorSsuTx.object(config.adminAcl)],
        });

        const ssuResult = await client.signAndExecuteTransaction({
            transaction: anchorSsuTx,
            signer: adminKeypair,
            options: { showEvents: true },
        });

        const ssuEvent = extractEvent<{ storage_unit_id: string; owner_cap_id: string }>(
            ssuResult,
            "::storage_unit::StorageUnitCreatedEvent",
        );
        if (!ssuEvent) throw new Error("StorageUnitCreatedEvent not found");

        console.log(`SSU created: ${ssuEvent.storage_unit_id}`);
        console.log(`SSU OwnerCap: ${ssuEvent.owner_cap_id}`);

        await delay(DELAY);

        // ── 5. Bring SSU online (Player B signs) ───────────────────
        console.log("\n==== [Player B] Bringing SSU online ====");

        const ssuObjectId = deriveObjectId(
            config.objectRegistry,
            STORAGE_B_ITEM_ID,
            config.packageId,
        );
        const ssuOwnerCap = await getSsuOwnerCap(ssuObjectId, client, config, playerAddress);
        if (!ssuOwnerCap) throw new Error(`SSU OwnerCap not found for ${ssuObjectId}`);

        const onlineSsuTx = new Transaction();

        const [borrowedSsuCap, ssuReceipt] = onlineSsuTx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::borrow_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.STORAGE_UNIT}::StorageUnit`],
            arguments: [onlineSsuTx.object(characterB), onlineSsuTx.object(ssuOwnerCap)],
        });

        onlineSsuTx.moveCall({
            target: `${config.packageId}::${MODULES.STORAGE_UNIT}::online`,
            arguments: [
                onlineSsuTx.object(ssuObjectId),
                onlineSsuTx.object(nwnObjectId),
                onlineSsuTx.object(config.energyConfig),
                borrowedSsuCap,
            ],
        });

        onlineSsuTx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::return_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.STORAGE_UNIT}::StorageUnit`],
            arguments: [onlineSsuTx.object(characterB), borrowedSsuCap, ssuReceipt],
        });

        const onlineSsuResult = await client.signAndExecuteTransaction({
            transaction: onlineSsuTx,
            signer: playerCtx.keypair,
            options: { showEffects: true },
        });
        console.log(`SSU online — digest: ${onlineSsuResult.digest}`);

        console.log("\n==== Player B NWN + empty SSU seeded successfully ====\n");
    } catch (error) {
        handleError(error);
    }
}

main();
