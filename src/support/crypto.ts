/**
 * Cryptographic utilities
 *
 * Provides Ed25519, X25519, and HKDF operations.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha512 } from '@noble/hashes/sha512';

/**
 * Generate Ed25519 key pair
 */
export function generateEd25519KeyPair(): { privateKey: Buffer; publicKey: Buffer } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  return {
    privateKey: Buffer.from(privateKey),
    publicKey: Buffer.from(publicKey),
  };
}

/**
 * Sign data with Ed25519 private key
 */
export function ed25519Sign(privateKey: Buffer, message: Buffer): Buffer {
  const signature = ed25519.sign(new Uint8Array(message), new Uint8Array(privateKey));
  return Buffer.from(signature);
}

/**
 * Verify Ed25519 signature
 */
export function ed25519Verify(publicKey: Buffer, message: Buffer, signature: Buffer): boolean {
  try {
    return ed25519.verify(
      new Uint8Array(signature),
      new Uint8Array(message),
      new Uint8Array(publicKey)
    );
  } catch {
    return false;
  }
}

/**
 * Get Ed25519 public key from private key
 */
export function ed25519GetPublicKey(privateKey: Buffer): Buffer {
  return Buffer.from(ed25519.getPublicKey(new Uint8Array(privateKey)));
}

/**
 * Generate X25519 key pair
 */
export function generateX25519KeyPair(): { privateKey: Buffer; publicKey: Buffer } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    privateKey: Buffer.from(privateKey),
    publicKey: Buffer.from(publicKey),
  };
}

/**
 * Perform X25519 key exchange
 */
export function x25519SharedSecret(privateKey: Buffer, publicKey: Buffer): Buffer {
  const shared = x25519.getSharedSecret(new Uint8Array(privateKey), new Uint8Array(publicKey));
  return Buffer.from(shared);
}

/**
 * Get X25519 public key from private key
 */
export function x25519GetPublicKey(privateKey: Buffer): Buffer {
  return Buffer.from(x25519.getPublicKey(new Uint8Array(privateKey)));
}

/**
 * HKDF key derivation using SHA-512
 */
export function hkdfExpand(salt: string, info: string, sharedSecret: Buffer): Buffer {
  const derived = hkdf(
    sha512,
    new Uint8Array(sharedSecret),
    Buffer.from(salt, 'utf-8'),
    Buffer.from(info, 'utf-8'),
    32
  );
  return Buffer.from(derived);
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Buffer {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes);
}
