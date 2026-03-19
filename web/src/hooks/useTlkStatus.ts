/**
 * Shadow Location Network — TLK lifecycle hook.
 *
 * Wraps the raw useLocationPods TLK primitives into a higher-level
 * interface that tracks initialisation state, caches the unwrapped
 * symmetric key in a ref (never persisted), and provides one-call
 * init/unwrap flows.
 */

import { useState, useCallback, useRef } from "react";
import { useLocationPods } from "./useLocationPods";

// ============================================================
// Types
// ============================================================

export interface UseTlkStatusReturn {
  /** Raw 32-byte AES key (null until unwrapped). Never persisted. */
  tlkBytes: Uint8Array | null;
  /** Current TLK version from the server (null if not fetched). */
  tlkVersion: number | null;
  /** Whether a TLK exists for the tribe on the server. */
  isInitialized: boolean;
  /** Whether a fetch/unwrap/init operation is running. */
  isLoading: boolean;
  /** Last error message. */
  error: string | null;
  /** Fetch the wrapped TLK from the server and update status. */
  fetchStatus: (tribeId: string) => Promise<void>;
  /** Initialize TLK for the tribe (officer+ only). */
  initialize: (params: {
    tribeId: string;
    memberPublicKeys: { address: string; x25519Pub: string }[];
  }) => Promise<void>;
  /** Store an externally-unwrapped TLK (e.g. from a wallet signing flow). */
  setUnwrappedTlk: (tlk: Uint8Array, version: number) => void;
  /** The base64-encoded wrapped key from the server (for client-side unwrap). */
  wrappedKey: string | null;
}

// ============================================================
// Hook
// ============================================================

export function useTlkStatus(): UseTlkStatusReturn {
  const { fetchWrappedTlk, initializeTlk } = useLocationPods();

  const [isInitialized, setIsInitialized] = useState(false);
  const [tlkVersion, setTlkVersion] = useState<number | null>(null);
  const [wrappedKey, setWrappedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-memory only — cleared on page refresh
  const tlkBytesRef = useRef<Uint8Array | null>(null);
  const [, forceUpdate] = useState(0);

  const fetchStatus = useCallback(
    async (tribeId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchWrappedTlk(tribeId);
        if (result) {
          setIsInitialized(true);
          setTlkVersion(result.tlkVersion);
          setWrappedKey(result.wrappedKey);
        } else {
          setIsInitialized(false);
          setTlkVersion(null);
          setWrappedKey(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch TLK status";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchWrappedTlk],
  );

  const initialize = useCallback(
    async (params: {
      tribeId: string;
      memberPublicKeys: { address: string; x25519Pub: string }[];
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await initializeTlk(params);
        setIsInitialized(true);
        setTlkVersion(result.tlkVersion);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to initialize TLK";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [initializeTlk],
  );

  const setUnwrappedTlk = useCallback((tlk: Uint8Array, version: number) => {
    tlkBytesRef.current = tlk;
    setTlkVersion(version);
    forceUpdate((n) => n + 1);
  }, []);

  return {
    tlkBytes: tlkBytesRef.current,
    tlkVersion,
    isInitialized,
    isLoading,
    error,
    fetchStatus,
    initialize,
    setUnwrappedTlk,
    wrappedKey,
  };
}
