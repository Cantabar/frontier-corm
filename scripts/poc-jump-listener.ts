#!/usr/bin/env npx tsx
/**
 * PoC: JumpEvent listener for Eve Frontier Stillness (SUI Testnet)
 *
 * Queries the SUI testnet RPC for world::gate::JumpEvent emissions.
 * Run:  npx tsx scripts/poc-jump-listener.ts
 *
 * Set WORLD_PACKAGE_ID env var to override the default.
 * Set SUI_RPC_URL to use a custom RPC endpoint.
 */

import { SuiClient } from "@mysten/sui/client";

// ---------------------------------------------------------------------------
// Config — fill in the world package ID from the Stillness deployment.
// You can find it via `sui client switch --env testnet_stillness` then
// checking the deploy output, or ask the CCP / Frontier team on Discord.
// ---------------------------------------------------------------------------
const WORLD_PACKAGE_ID =
  process.env.WORLD_PACKAGE_ID ??
  "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

const SUI_RPC_URL =
  process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";

const JUMP_EVENT_TYPE = `${WORLD_PACKAGE_ID}::gate::JumpEvent`;

const POLL_INTERVAL_MS = 5_000; // 5 seconds between polls
const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Frontier Corm — JumpEvent PoC Listener ===");
  console.log(`  RPC:        ${SUI_RPC_URL}`);
  console.log(`  Package:    ${WORLD_PACKAGE_ID}`);
  console.log(`  Event type: ${JUMP_EVENT_TYPE}`);
  console.log();

  if (WORLD_PACKAGE_ID.includes("REPLACE")) {
    console.error(
      "ERROR: Set WORLD_PACKAGE_ID to the Stillness world package address.\n" +
        "       e.g.  WORLD_PACKAGE_ID=0xabc123... npx tsx scripts/poc-jump-listener.ts",
    );
    process.exit(1);
  }

  const client = new SuiClient({ url: SUI_RPC_URL });

  // ---- One-shot historical query first ----
  console.log("[query] Fetching recent JumpEvents (up to last 25)...\n");

  try {
    const result = await client.queryEvents({
      query: { MoveEventType: JUMP_EVENT_TYPE },
      limit: PAGE_SIZE,
      order: "descending", // newest first for the initial peek
    });

    if (result.data.length === 0) {
      console.log(
        "[query] No JumpEvents found yet.  This could mean:\n" +
          "  • The package ID is wrong\n" +
          "  • Nobody has jumped through a gate on Stillness yet\n" +
          "  • The event type path changed\n",
      );
    } else {
      console.log(`[query] Found ${result.data.length} recent JumpEvent(s):\n`);
      for (const evt of result.data) {
        printEvent(evt);
      }
    }

    // ---- Start polling for new events ----
    console.log("\n[poll] Watching for new JumpEvents (Ctrl-C to stop)...\n");

    // Use the newest event as starting cursor so we only get *new* ones
    let cursor =
      result.data.length > 0
        ? {
            txDigest: result.data[0].id.txDigest,
            eventSeq: result.data[0].id.eventSeq,
          }
        : undefined;

    while (true) {
      await sleep(POLL_INTERVAL_MS);

      const page = await client.queryEvents({
        query: { MoveEventType: JUMP_EVENT_TYPE },
        cursor,
        limit: PAGE_SIZE,
        order: "ascending",
      });

      if (page.data.length > 0) {
        for (const evt of page.data) {
          printEvent(evt);
        }
        const last = page.data[page.data.length - 1];
        cursor = { txDigest: last.id.txDigest, eventSeq: last.id.eventSeq };
      }
    }
  } catch (err: unknown) {
    console.error("[error]", err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface JumpEventFields {
  source_gate_id?: string;
  source_gate_key?: unknown;
  destination_gate_id?: string;
  destination_gate_key?: unknown;
  character_id?: string;
  character_key?: unknown;
}

function printEvent(evt: { id: { txDigest: string; eventSeq: string }; timestampMs?: string | null; parsedJson?: unknown }) {
  const fields = (evt.parsedJson ?? {}) as JumpEventFields;
  const ts = evt.timestampMs
    ? new Date(Number(evt.timestampMs)).toISOString()
    : "n/a";

  console.log(`  tx:    ${evt.id.txDigest}  seq=${evt.id.eventSeq}`);
  console.log(`  time:  ${ts}`);
  console.log(`  from:  ${fields.source_gate_id ?? "?"}`);
  console.log(`  to:    ${fields.destination_gate_id ?? "?"}`);
  console.log(`  char:  ${fields.character_id ?? "?"}`);
  console.log(`  raw:   ${JSON.stringify(fields)}`);
  console.log();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main();
