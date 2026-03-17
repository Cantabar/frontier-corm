/**
 * Express HTTP server for the Frontier Corm indexer query API.
 */

import express from "express";
import cors from "cors";
import type pg from "pg";
import { createRouter } from "./routes.js";
import { createLocationRouter } from "./location-routes.js";
import { createZkRouter } from "./zk-routes.js";
import { initVerifier } from "../location/zk-verifier.js";

export function createServer(pool: pg.Pool, port: number) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API routes under /api/v1
  app.use("/api/v1", createRouter(pool));

  // Mount Shadow Location Network routes
  app.use("/api/v1/locations", createLocationRouter(pool));

  // Mount ZK proof routes and try to load verification keys
  app.use("/api/v1/locations/proofs", createZkRouter(pool));
  initVerifier();

  // Health check (used by ALB and docker-compose)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/", (_req, res) => {
    res.json({
      service: "frontier-corm-indexer",
      version: "0.1.0",
      api: "/api/v1",
    });
  });

  const server = app.listen(port, () => {
    console.log(`[api] Indexer API listening on http://localhost:${port}`);
    console.log(`[api] Endpoints: GET /api/v1/events, /api/v1/reputation/:tribeId/:characterId, /api/v1/proof/:eventId`);
    console.log(`[api] Shadow Location Network: /api/v1/locations/*`);
    console.log(`[api] ZK Proofs: /api/v1/locations/proofs/*`);
  });

  return server;
}
