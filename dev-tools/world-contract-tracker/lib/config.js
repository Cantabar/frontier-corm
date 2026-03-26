/** SUI testnet full-node JSON-RPC endpoint */
export const SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";

/** GitHub raw content URL for Published.toml */
export const PUBLISHED_TOML_RAW_URL =
  "https://raw.githubusercontent.com/evefrontier/world-contracts/main/contracts/world/Published.toml";

/** GitHub API base for the world-contracts repo */
export const GITHUB_API_BASE =
  "https://api.github.com/repos/evefrontier/world-contracts";

/** Path inside the repo that Published.toml lives at */
export const PUBLISHED_TOML_PATH = "contracts/world/Published.toml";

/** Path prefix for world contract source files */
export const WORLD_SOURCES_PATH = "contracts/world/sources";

/** Suiscan testnet base URL */
export const SUISCAN_BASE = "https://suiscan.xyz/testnet";

/**
 * Environments we track.
 * `key` matches the [published.<key>] section in Published.toml.
 */
export const ENVIRONMENTS = [
  { key: "testnet_stillness", label: "Stillness" },
  { key: "testnet_utopia", label: "Utopia" },
];
