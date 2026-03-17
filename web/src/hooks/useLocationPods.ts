/**
 * Shadow Location Network — React hook for managing location PODs.
 *
 * Provides:
 *   - Fetching and decrypting tribe location PODs
 *   - Submitting new encrypted location PODs
 *   - TLK initialisation and key management
 *   - Wallet signature authentication for all Location API calls
 */

import { useState, useCallback, useRef } from "react";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useIdentity } from "./useIdentity";
import {
  getLocationPodsByTribe,
  submitLocationPod,
  deleteLocationPod as apiDeletePod,
  getTlk,
  initTlk,
  type LocationPodResponse,
} from "../lib/indexer";
import {
  buildAuthChallenge,
  buildAuthHeader,
  computeLocationHash,
  generateSalt,
  encryptLocation,
  decryptLocation,
  base64ToBytes,
  bytesToBase64,
  type LocationData,
} from "../lib/locationCrypto";

// ============================================================
// Types
// ============================================================

export interface DecryptedPod {
  structureId: string;
  ownerAddress: string;
  locationHash: string;
  location: LocationData & { salt: string };
  podVersion: number;
  tlkVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface UseLocationPodsReturn {
  /** Decrypted location PODs for the active tribe */
  pods: DecryptedPod[];
  /** Whether a fetch/decrypt operation is in progress */
  isLoading: boolean;
  /** Last error encountered */
  error: string | null;
  /** Fetch and decrypt all PODs for the user's tribe */
  fetchPods: (tribeId: string, tlkBytes: Uint8Array) => Promise<void>;
  /** Submit a new location POD */
  submitPod: (params: {
    structureId: string;
    tribeId: string;
    location: LocationData;
    tlkBytes: Uint8Array;
    tlkVersion: number;
  }) => Promise<void>;
  /** Delete (revoke) a location POD */
  deletePod: (structureId: string) => Promise<void>;
  /** Initialise TLK for a tribe (first-time setup) */
  initializeTlk: (params: {
    tribeId: string;
    memberPublicKeys: { address: string; x25519Pub: string }[];
  }) => Promise<{ tlkVersion: number }>;
  /** Fetch the caller's wrapped TLK from the server */
  fetchWrappedTlk: (tribeId: string) => Promise<{ wrappedKey: string; tlkVersion: number } | null>;
  /** Get a fresh auth header (signs a challenge with the wallet) */
  getAuthHeader: () => Promise<string>;
}

// ============================================================
// Hook
// ============================================================

export function useLocationPods(): UseLocationPodsReturn {
  const { address } = useIdentity();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [pods, setPods] = useState<DecryptedPod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache auth header briefly to avoid signing every single request
  const authCacheRef = useRef<{ header: string; expiresAt: number } | null>(null);

  const getAuthHeader = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Wallet not connected");

    // Reuse cached auth if still valid (2-minute window within the 5-minute server window)
    const now = Date.now();
    if (authCacheRef.current && authCacheRef.current.expiresAt > now) {
      return authCacheRef.current.header;
    }

    const challenge = buildAuthChallenge(address);
    const { signature } = await signPersonalMessage({ message: challenge });
    const header = buildAuthHeader(challenge, signature);

    authCacheRef.current = { header, expiresAt: now + 2 * 60 * 1000 };
    return header;
  }, [address, signPersonalMessage]);

  const fetchPods = useCallback(
    async (tribeId: string, tlkBytes: Uint8Array) => {
      setIsLoading(true);
      setError(null);
      try {
        const authHeader = await getAuthHeader();
        const { pods: rawPods } = await getLocationPodsByTribe(tribeId, authHeader);

        const decrypted: DecryptedPod[] = [];
        for (const pod of rawPods) {
          try {
            const location = await decryptLocation(
              base64ToBytes(pod.encrypted_blob),
              base64ToBytes(pod.nonce),
              tlkBytes,
            );
            decrypted.push({
              structureId: pod.structure_id,
              ownerAddress: pod.owner_address,
              locationHash: pod.location_hash,
              location,
              podVersion: pod.pod_version,
              tlkVersion: pod.tlk_version,
              createdAt: pod.created_at,
              updatedAt: pod.updated_at,
            });
          } catch {
            // POD may be encrypted with a different TLK version — skip
            console.warn(`[locations] Failed to decrypt POD for ${pod.structure_id}`);
          }
        }

        setPods(decrypted);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch PODs";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeader],
  );

  const submitPod = useCallback(
    async (params: {
      structureId: string;
      tribeId: string;
      location: LocationData;
      tlkBytes: Uint8Array;
      tlkVersion: number;
    }) => {
      setError(null);
      try {
        const authHeader = await getAuthHeader();

        // 1. Generate salt and compute Poseidon commitment
        const salt = generateSalt();
        const locationHash = computeLocationHash(
          params.location.x,
          params.location.y,
          params.location.z,
          salt,
        );

        // 2. Encrypt location data with TLK
        const { ciphertext, nonce } = await encryptLocation(
          params.location,
          salt,
          params.tlkBytes,
        );

        // 3. Sign the full POD payload with wallet
        const podBytes = new TextEncoder().encode(
          JSON.stringify({
            structureId: params.structureId,
            ownerAddress: address,
            tribeId: params.tribeId,
            locationHash,
            timestamp: Date.now(),
          }),
        );
        const { signature } = await signPersonalMessage({ message: podBytes });

        // 4. Submit to server
        await submitLocationPod(authHeader, {
          structureId: params.structureId,
          tribeId: params.tribeId,
          locationHash,
          encryptedBlob: bytesToBase64(ciphertext),
          nonce: bytesToBase64(nonce),
          signature,
          podVersion: 1,
          tlkVersion: params.tlkVersion,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to submit POD";
        setError(msg);
        throw err;
      }
    },
    [address, getAuthHeader, signPersonalMessage],
  );

  const deletePod = useCallback(
    async (structureId: string) => {
      setError(null);
      try {
        const authHeader = await getAuthHeader();
        await apiDeletePod(structureId, authHeader);
        setPods((prev) => prev.filter((p) => p.structureId !== structureId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete POD";
        setError(msg);
        throw err;
      }
    },
    [getAuthHeader],
  );

  const initializeTlk = useCallback(
    async (params: {
      tribeId: string;
      memberPublicKeys: { address: string; x25519Pub: string }[];
    }): Promise<{ tlkVersion: number }> => {
      const authHeader = await getAuthHeader();
      const result = await initTlk(authHeader, params);
      return { tlkVersion: result.tlk_version };
    },
    [getAuthHeader],
  );

  const fetchWrappedTlk = useCallback(
    async (tribeId: string): Promise<{ wrappedKey: string; tlkVersion: number } | null> => {
      try {
        const authHeader = await getAuthHeader();
        const result = await getTlk(tribeId, authHeader);
        return { wrappedKey: result.wrapped_key, tlkVersion: result.tlk_version };
      } catch {
        return null;
      }
    },
    [getAuthHeader],
  );

  return {
    pods,
    isLoading,
    error,
    fetchPods,
    submitPod,
    deletePod,
    initializeTlk,
    fetchWrappedTlk,
    getAuthHeader,
  };
}
