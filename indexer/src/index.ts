/**
 * Frontier Corm Event Indexer — Entry Point
 *
 * Initialises:
 *   1. SQLite database (schema migration)
 *   2. Event archiver (write-side)
 *   3. Checkpoint subscriber (Sui RPC polling)
 *   4. Express API server (read-side)
 *
 * Environment variables (all optional, sensible defaults for local dev):
 *   SUI_RPC_URL          — Sui RPC endpoint (default: http://127.0.0.1:9000)
 *   PACKAGE_TRIBE              — Deployed tribe package ID
 *   PACKAGE_FORGE_PLANNER      — Deployed forge_planner package ID
 *   PACKAGE_TRUSTLESS_CONTRACTS — Deployed trustless_contracts package ID
 *   DATABASE_URL         — Postgres connection string (default: postgresql://corm:corm@localhost:5432/frontier_corm)
 *   API_PORT             — API server port (default: 3100)
 *   POLL_INTERVAL_MS     — Event poll interval in ms (default: 2000)
 */

import { initDatabase } from "./db/schema.js";
import { EventArchiver } from "./archiver/event-archiver.js";
import { CheckpointSubscriber } from "./subscriber/checkpoint-subscriber.js";
import { createServer } from "./api/server.js";
import { DEFAULT_CONFIG } from "./types.js";

async function main() {
  const config = DEFAULT_CONFIG;

  console.log("=== Frontier Corm Event Indexer ===");
  console.log(`  Sui RPC:   ${config.suiRpcUrl}`);
  console.log(`  DB:        ${config.databaseUrl.replace(/\/\/.*@/, "//***@")}`);
  console.log(`  API port:  ${config.apiPort}`);
  console.log(`  Poll:      ${config.pollIntervalMs}ms`);

  // Validate package IDs
  const missingPackages = Object.entries(config.packageIds)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missingPackages.length > 0) {
    console.warn(
      `\n  ⚠  Missing package IDs: ${missingPackages.join(", ")}`,
    );
    console.warn(
      "     Set PACKAGE_TRIBE, PACKAGE_FORGE_PLANNER, PACKAGE_TRUSTLESS_CONTRACTS env vars.",
    );
    console.warn(
      "     The indexer will start but won't subscribe to events for missing packages.\n",
    );
  }

  // 1. Init database
  const pool = await initDatabase(config.databaseUrl);
  console.log("[db] Database initialised.");

  // 2. Init archiver
  const archiver = new EventArchiver(pool);

  // 3. Init subscriber
  const subscriber = new CheckpointSubscriber(config, pool, archiver);

  // 4. Start API server
  const server = createServer(pool, config.apiPort);

  // 5. Start subscriber (only if at least one package ID is configured)
  if (missingPackages.length < Object.keys(config.packageIds).length) {
    subscriber.start();
  } else {
    console.log("[subscriber] No package IDs configured — subscriber not started.");
    console.log("[subscriber] The API server is running; set package IDs and restart to begin indexing.");
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    subscriber.stop();
    server.close(async () => {
      await pool.end();
      console.log("Goodbye.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
