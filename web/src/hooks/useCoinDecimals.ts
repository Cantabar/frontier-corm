/**
 * Hook to fetch the decimal precision and symbol for a given coin type.
 *
 * Uses `getCoinMetadata` from the Sui JSON-RPC, which is automatically
 * cached by `useSuiClientQuery`.  Falls back to 9 decimals (native SUI)
 * when metadata is unavailable.
 */

import { useSuiClientQuery } from "@mysten/dapp-kit";
import { SUI_DECIMALS, parseCoinSymbol } from "../lib/coinUtils";
import { config } from "../config";

export interface CoinDecimalsResult {
  /** Number of decimal places (e.g. 9 for SUI, 6 for USDC). */
  decimals: number;
  /** Human-readable symbol derived from metadata or coin type. */
  symbol: string;
  /** True while the metadata query is in-flight. */
  isLoading: boolean;
}

/**
 * Fetch decimals + symbol for an arbitrary coin type.
 *
 * The query is enabled only when `coinType` is a non-empty string.
 * Results are cached per coin type for the lifetime of the SUI client
 * provider, so multiple components can call this without extra RPCs.
 */
export function useCoinDecimals(coinType: string): CoinDecimalsResult {
  const { data, isLoading } = useSuiClientQuery(
    "getCoinMetadata",
    { coinType },
    { enabled: !!coinType },
  );

  return {
    decimals: data?.decimals ?? SUI_DECIMALS,
    symbol: data?.symbol ?? parseCoinSymbol(coinType),
    isLoading,
  };
}

/**
 * Returns the preferred default coin type: CORM if configured, otherwise
 * the static escrow coin type from config (typically SUI).
 */
export function defaultCoinType(): string {
  return config.cormCoinType || config.coinType;
}

/**
 * Convenience wrapper: returns decimals for the configured escrow coin type (CE).
 * Prefers CORM when configured.
 */
export function useEscrowCoinDecimals(): CoinDecimalsResult {
  return useCoinDecimals(defaultCoinType());
}

/**
 * Convenience wrapper: returns decimals for the configured fill coin type (CF).
 * Prefers CORM when configured.
 */
export function useFillCoinDecimals(): CoinDecimalsResult {
  return useCoinDecimals(config.cormCoinType || config.fillCoinType);
}

/**
 * Convenience wrapper: returns decimals for the CORM coin type specifically.
 * Falls back to default escrow coin if CORM is not configured.
 */
export function useCormCoinDecimals(): CoinDecimalsResult {
  return useCoinDecimals(defaultCoinType());
}
