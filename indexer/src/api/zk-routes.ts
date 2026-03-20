/**
 * Shadow Location Network — ZK proof API routes.
 *
 * Endpoints:
 *   POST /submit      Submit a Groth16 proof for a structure × filter.
 *   GET  /region      Query PODs with verified region-filter proofs.
 *   GET  /proximity   Query PODs with verified proximity-filter proofs.
 *
 * Mount under /api/v1/locations/proofs in the main Express server.
 */

import { Router, type Request, type Response } from "express";
import type pg from "pg";
import { verifyWalletAuth } from "../location/crypto.js";
import {
  verifyFilterProof,
  buildFilterKey,
} from "../location/zk-verifier.js";
import {
  upsertFilterProof,
  getFilterProofsByKey,
  getLocationPod,
  getDerivedPodsByNetworkNode,
  upsertDerivedFilterProof,
} from "../db/location-queries.js";

export function createZkRouter(pool: pg.Pool): Router {
  const router = Router();

  // ---- Auth (same helper as location-routes) ----
  async function authenticate(req: Request, res: Response): Promise<string | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("SuiSig ")) {
      res.status(401).json({ error: "Missing SuiSig authorization header" });
      return null;
    }

    const payload = authHeader.slice(7);
    const dotIdx = payload.indexOf(".");
    if (dotIdx === -1) {
      res.status(401).json({ error: "Malformed SuiSig token" });
      return null;
    }

    const messageB64 = payload.slice(0, dotIdx);
    const signature = payload.slice(dotIdx + 1);
    const message = Buffer.from(messageB64, "base64");

    const result = await verifyWalletAuth(message, signature);
    if (!result.valid) {
      res.status(401).json({ error: result.error ?? "Signature verification failed" });
      return null;
    }

    return result.address;
  }

  // ================================================================
  // POST /submit — Submit a Groth16 proof for a structure × filter
  //
  // Body: {
  //   structureId, tribeId, filterType, publicSignals, proof
  // }
  // ================================================================
  router.post("/submit", async (req: Request, res: Response) => {
    const address = await authenticate(req, res);
    if (!address) return;

    const {
      structureId,
      tribeId,
      filterType,
      publicSignals,
      proof,
    } = req.body as {
      structureId: string;
      tribeId: string;
      filterType: "region" | "proximity";
      publicSignals: string[];
      proof: Record<string, unknown>;
    };

    if (
      !structureId ||
      !tribeId ||
      !filterType ||
      !publicSignals?.length ||
      !proof
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (filterType !== "region" && filterType !== "proximity") {
      res.status(400).json({ error: "filterType must be 'region' or 'proximity'" });
      return;
    }

    try {
      // 1. Verify the proof cryptographically
      const verifyResult = await verifyFilterProof(filterType, publicSignals, proof);
      if (!verifyResult.valid) {
        res.status(422).json({
          error: "Proof verification failed",
          detail: verifyResult.error,
        });
        return;
      }

      // 2. Confirm the POD exists for this structure × tribe
      const pod = await getLocationPod(pool, structureId, tribeId);
      if (!pod) {
        res.status(404).json({ error: "No location POD found for this structure and tribe" });
        return;
      }

      // 3. Verify the proof's location_hash matches the POD
      // publicSignals[0] is always location_hash
      const proofLocationHash = publicSignals[0];
      if (!proofLocationHash) {
        res.status(400).json({ error: "publicSignals[0] must be location_hash" });
        return;
      }

      // Convert POD hex hash to decimal for comparison
      const podHashDecimal = BigInt(pod.location_hash).toString();
      if (proofLocationHash !== podHashDecimal) {
        res.status(422).json({
          error: "Proof location_hash does not match the stored POD",
        });
        return;
      }

      // 4. Store the verified proof
      const filterKey = buildFilterKey(filterType, publicSignals);
      const id = await upsertFilterProof(pool, {
        structureId,
        tribeId,
        locationHash: pod.location_hash,
        filterType,
        filterKey,
        publicSignals,
        proofJson: proof,
      });

      // 5. Propagate proof to derived structures if this is a Network Node
      let propagatedCount = 0;
      try {
        const derivedPods = await getDerivedPodsByNetworkNode(
          pool,
          structureId,
          tribeId,
        );
        for (const derived of derivedPods) {
          await upsertDerivedFilterProof(pool, {
            structureId: derived.structure_id,
            tribeId,
            locationHash: pod.location_hash,
            filterType,
            filterKey,
            publicSignals,
            proofJson: proof,
            sourceNetworkNodeId: structureId,
          });
          propagatedCount++;
        }
      } catch (propErr) {
        // Non-fatal — the primary proof is still stored
        console.warn(
          "[zk] Failed to propagate proof to derived structures:",
          propErr,
        );
      }

      res.json({
        id,
        structureId,
        tribeId,
        filterType,
        verified: true,
        propagated: propagatedCount,
      });
    } catch (err) {
      console.error("[zk] Failed to submit proof:", err);
      res.status(500).json({ error: "Failed to submit proof" });
    }
  });

  // ================================================================
  // GET /region — Query PODs with verified region-filter proofs
  //
  // Query params: tribeId, xMin, xMax, yMin, yMax, zMin, zMax
  // (all values are decimal-encoded biased coordinates)
  // ================================================================
  router.get("/region", async (req: Request, res: Response) => {
    const address = await authenticate(req, res);
    if (!address) return;

    const { tribeId, xMin, xMax, yMin, yMax, zMin, zMax } = req.query as Record<string, string>;
    if (!tribeId || !xMin || !xMax || !yMin || !yMax || !zMin || !zMax) {
      res.status(400).json({ error: "All region bound params required" });
      return;
    }

    try {
      const filterKey = `region:${xMin},${xMax},${yMin},${yMax},${zMin},${zMax}`;
      const proofs = await getFilterProofsByKey(pool, tribeId, "region", filterKey);
      res.json({
        tribe_id: tribeId,
        filter_type: "region",
        count: proofs.length,
        results: proofs,
      });
    } catch (err) {
      console.error("[zk] Failed to query region proofs:", err);
      res.status(500).json({ error: "Failed to query proofs" });
    }
  });

  // ================================================================
  // GET /proximity — Query PODs with verified proximity-filter proofs
  //
  // Query params: tribeId, refX, refY, refZ, maxDistSq
  // ================================================================
  router.get("/proximity", async (req: Request, res: Response) => {
    const address = await authenticate(req, res);
    if (!address) return;

    const { tribeId, refX, refY, refZ, maxDistSq } = req.query as Record<string, string>;
    if (!tribeId || !refX || !refY || !refZ || !maxDistSq) {
      res.status(400).json({ error: "All proximity params required" });
      return;
    }

    try {
      const filterKey = `proximity:${refX},${refY},${refZ},${maxDistSq}`;
      const proofs = await getFilterProofsByKey(pool, tribeId, "proximity", filterKey);
      res.json({
        tribe_id: tribeId,
        filter_type: "proximity",
        count: proofs.length,
        results: proofs,
      });
    } catch (err) {
      console.error("[zk] Failed to query proximity proofs:", err);
      res.status(500).json({ error: "Failed to query proofs" });
    }
  });

  return router;
}
