/**
 * Shadow Location Network — server-side cryptographic utilities.
 *
 * Responsibilities:
 *   - Generate random AES-256-GCM Tribe Location Keys (TLK)
 *   - Wrap / unwrap TLK using X25519 ECDH + HKDF
 *   - Verify SUI wallet personal message signatures for API auth
 *
 * The server NEVER sees plaintext location data. It only handles
 * TLK lifecycle and signature verification.
 */

import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { x25519 } from "@noble/curves/ed25519";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

// ============================================================
// TLK Generation
// ============================================================

/** Generate a random 256-bit AES key for tribe location encryption. */
export function generateTlk(): Buffer {
  return randomBytes(32);
}

// ============================================================
// X25519 Key Wrapping (ECIES-style)
//
// To wrap a TLK for a tribe member:
//   1. Generate ephemeral X25519 keypair
//   2. ECDH with member's X25519 public key → shared secret
//   3. HKDF-SHA256(shared secret) → wrapping key
//   4. AES-256-GCM encrypt the TLK with the wrapping key
//   5. Output: ephemeral_pub ‖ nonce ‖ ciphertext ‖ tag
//
// The member unwraps by performing ECDH with their X25519 secret
// key and the ephemeral public key, then decrypting.
// ============================================================

const WRAP_INFO = Buffer.from("frontier-corm-tlk-wrap-v1");

/** Derive a 32-byte wrapping key from an X25519 shared secret via HMAC-SHA256. */
function deriveWrappingKey(sharedSecret: Uint8Array): Buffer {
  // Simplified HKDF-extract + expand (single block) using HMAC-SHA256
  const prk = createHmac("sha256", WRAP_INFO).update(sharedSecret).digest();
  return prk; // 32 bytes — sufficient for AES-256
}

/**
 * Wrap a TLK for a specific member's X25519 public key.
 *
 * @param tlk          Raw 32-byte AES key
 * @param memberX25519Pub  Member's X25519 public key (32 bytes)
 * @returns Opaque wrapped key blob (ephemeral_pub ‖ nonce ‖ ciphertext ‖ tag)
 */
export function wrapTlk(tlk: Buffer, memberX25519Pub: Uint8Array): Buffer {
  // Ephemeral keypair
  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);

  // ECDH → shared secret
  const shared = x25519.getSharedSecret(ephPriv, memberX25519Pub);
  const wrappingKey = deriveWrappingKey(shared);

  // AES-256-GCM encrypt the TLK
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrappingKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(tlk), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack: ephPub(32) + nonce(12) + ciphertext(32) + tag(16) = 92 bytes
  return Buffer.concat([ephPub, nonce, ciphertext, tag]);
}

/**
 * Unwrap a TLK using the member's X25519 private key.
 * (Server-side utility for testing / key rotation; normally done client-side.)
 */
export function unwrapTlk(wrappedKey: Buffer, memberX25519Priv: Uint8Array): Buffer {
  const ephPub = wrappedKey.subarray(0, 32);
  const nonce = wrappedKey.subarray(32, 44);
  const ciphertext = wrappedKey.subarray(44, 76);
  const tag = wrappedKey.subarray(76, 92);

  const shared = x25519.getSharedSecret(memberX25519Priv, ephPub);
  const wrappingKey = deriveWrappingKey(shared);

  const decipher = createDecipheriv("aes-256-gcm", wrappingKey, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ============================================================
// Wallet Signature Verification
// ============================================================

/**
 * Challenge format: "frontier-corm:<address>:<timestamp_ms>"
 *
 * The client signs this with signPersonalMessage(). The server verifies
 * that the signature was produced by the claimed address and that the
 * timestamp is within the allowed window (5 minutes).
 */
const CHALLENGE_WINDOW_MS = 5 * 60 * 1000;

export interface AuthResult {
  valid: boolean;
  address: string;
  error?: string;
}

/**
 * Verify a SUI wallet personal message signature.
 *
 * @param message    The raw challenge bytes the client signed
 * @param signature  Base64-encoded SUI signature (scheme flag + sig + pubkey)
 * @returns          AuthResult with the verified address or an error
 */
export async function verifyWalletAuth(
  message: Uint8Array,
  signature: string,
): Promise<AuthResult> {
  try {
    // Parse the challenge text
    const text = new TextDecoder().decode(message);
    const parts = text.split(":");
    if (parts.length !== 3 || parts[0] !== "frontier-corm") {
      return { valid: false, address: "", error: "Invalid challenge format" };
    }

    const claimedAddress = parts[1];
    const timestampMs = Number(parts[2]);

    // Check timestamp freshness
    const now = Date.now();
    if (Math.abs(now - timestampMs) > CHALLENGE_WINDOW_MS) {
      return { valid: false, address: claimedAddress, error: "Challenge expired" };
    }

    // Verify the signature using the Sui SDK
    const publicKey = await verifyPersonalMessageSignature(message, signature, {
      address: claimedAddress,
    });

    const recoveredAddress = publicKey.toSuiAddress();
    if (recoveredAddress !== claimedAddress) {
      return { valid: false, address: claimedAddress, error: "Address mismatch" };
    }

    return { valid: true, address: claimedAddress };
  } catch (err) {
    return {
      valid: false,
      address: "",
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}
