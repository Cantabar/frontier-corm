import { SUI_RPC_URL } from "./config.js";

let rpcId = 0;

/**
 * Low-level SUI JSON-RPC call.
 * @param {string} method
 * @param {any[]} params
 * @returns {Promise<any>}
 */
async function rpc(method, params) {
  const res = await fetch(SUI_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

/**
 * Fetch a single object with content.
 */
export async function getObject(objectId) {
  return rpc("sui_getObject", [objectId, { showType: true, showContent: true }]);
}

/**
 * Fetch multiple objects in one call.
 * @param {string[]} ids
 */
export async function multiGetObjects(ids) {
  return rpc("sui_multiGetObjects", [ids, { showType: true, showContent: true }]);
}

/**
 * Read an UpgradeCap and return its fields.
 * @param {string} upgradeCapId
 * @returns {Promise<{ version: number, package: string, policy: number } | null>}
 */
export async function readUpgradeCap(upgradeCapId) {
  const result = await getObject(upgradeCapId);
  const data = result?.data;
  if (!data) return null;

  const fields = data.content?.fields;
  if (!fields) return null;

  return {
    version: Number(fields.version),
    package: fields.package,
    policy: Number(fields.policy),
  };
}
