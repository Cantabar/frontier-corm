/**
 * SUI RPC helpers for the Shadow Location Network.
 *
 * Provides server-side queries against the SUI JSON-RPC to resolve
 * on-chain Network Node data (connected assembly IDs).
 */

import { DEFAULT_CONFIG } from "../types.js";

// ============================================================
// Types
// ============================================================

interface SuiObjectContent {
  fields?: Record<string, unknown>;
}

interface SuiObjectData {
  objectId: string;
  content?: SuiObjectContent;
}

interface SuiGetObjectResponse {
  data?: SuiObjectData;
  error?: { code: string; message?: string };
}

// ============================================================
// RPC call helper
// ============================================================

async function suiJsonRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = DEFAULT_CONFIG.suiRpcUrl;
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`SUI RPC HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) {
    throw new Error(`SUI RPC error: ${json.error.message}`);
  }
  return json.result as T;
}

// ============================================================
// Public API
// ============================================================

/**
 * Fetch the `connected_assembly_ids` from a Network Node shared object.
 *
 * On-chain the field is an array of Sui object IDs representing structures
 * connected to this energy source.
 *
 * @param networkNodeId  The Sui object ID of the Network Node.
 * @returns Array of connected assembly (structure) object IDs.
 */
export async function getConnectedAssemblies(
  networkNodeId: string,
): Promise<string[]> {
  const resp = await suiJsonRpc<SuiGetObjectResponse>("sui_getObject", [
    networkNodeId,
    { showContent: true },
  ]);

  if (!resp.data?.content?.fields) {
    throw new Error(
      `Failed to read Network Node ${networkNodeId}: object not found or has no content`,
    );
  }

  const fields = resp.data.content.fields;
  const raw = fields.connected_assembly_ids;

  if (!Array.isArray(raw)) {
    // Field may be absent or empty on a newly deployed node
    return [];
  }

  return raw.map(String);
}
