/**
 * ChaCha20-Poly1305 encryption wrapper
 *
 * Provides transparent encryption/decryption layer using ChaCha20-Poly1305.
 * Manages nonce counters for both directions.
 *
 * Ported from: pyatv/support/chacha20.py
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';

const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * ChaCha20-Poly1305 cipher for bidirectional encryption
 */
export class Chacha20Cipher {
  private outCounter = 0;
  private inCounter = 0;
  private readonly nonceLength: number;
  private readonly outKey: Uint8Array;
  private readonly inKey: Uint8Array;

  /**
   * Create a new Chacha20Cipher
   * @param outKey - Key for encryption (32 bytes)
   * @param inKey - Key for decryption (32 bytes)
   * @param nonceLength - Nonce length (8 or 12, default 8)
   */
  constructor(outKey: Buffer, inKey: Buffer, nonceLength = 8) {
    this.outKey = new Uint8Array(outKey);
    this.inKey = new Uint8Array(inKey);
    this.nonceLength = nonceLength;
  }

  /**
   * Get the next encryption nonce
   */
  get outNonce(): Buffer {
    return this.buildNonce(this.outCounter);
  }

  /**
   * Get the next decryption nonce
   */
  get inNonce(): Buffer {
    return this.buildNonce(this.inCounter);
  }

  private buildNonce(counter: number): Buffer {
    if (this.nonceLength === NONCE_LENGTH) {
      // 12-byte nonce: counter as little-endian
      const nonce = Buffer.alloc(NONCE_LENGTH);
      nonce.writeBigUInt64LE(BigInt(counter), 0);
      return nonce;
    } else {
      // 8-byte nonce: 4 bytes padding + 8 bytes counter
      const nonce = Buffer.alloc(NONCE_LENGTH);
      // First 4 bytes are zero padding
      nonce.writeBigUInt64LE(BigInt(counter), 4);
      return nonce;
    }
  }

  private padNonce(nonce: Buffer): Buffer {
    if (nonce.length >= NONCE_LENGTH) {
      return nonce;
    }
    const padded = Buffer.alloc(NONCE_LENGTH);
    nonce.copy(padded, NONCE_LENGTH - nonce.length);
    return padded;
  }

  /**
   * Encrypt data
   * @param data - Data to encrypt
   * @param nonce - Optional custom nonce (uses counter if not provided)
   * @param aad - Optional additional authenticated data
   * @returns Encrypted data with auth tag appended
   */
  encrypt(data: Buffer, nonce?: Buffer | string, aad?: Buffer): Buffer {
    let nonceBuffer: Buffer;

    if (nonce === undefined) {
      nonceBuffer = this.outNonce;
      this.outCounter++;
    } else if (typeof nonce === 'string') {
      nonceBuffer = this.padNonce(Buffer.from(nonce, 'utf-8'));
    } else {
      nonceBuffer = this.padNonce(nonce);
    }

    const cipher = chacha20poly1305(this.outKey, nonceBuffer, aad);
    const encrypted = cipher.encrypt(new Uint8Array(data));

    return Buffer.from(encrypted);
  }

  /**
   * Decrypt data
   * @param data - Data to decrypt (with auth tag)
   * @param nonce - Optional custom nonce (uses counter if not provided)
   * @param aad - Optional additional authenticated data
   * @returns Decrypted data
   */
  decrypt(data: Buffer, nonce?: Buffer | string, aad?: Buffer): Buffer {
    let nonceBuffer: Buffer;

    if (nonce === undefined) {
      nonceBuffer = this.inNonce;
      this.inCounter++;
    } else if (typeof nonce === 'string') {
      nonceBuffer = this.padNonce(Buffer.from(nonce, 'utf-8'));
    } else {
      nonceBuffer = this.padNonce(nonce);
    }

    const cipher = chacha20poly1305(this.inKey, nonceBuffer, aad);
    const decrypted = cipher.decrypt(new Uint8Array(data));

    return Buffer.from(decrypted);
  }
}

/**
 * ChaCha20 cipher with 8-byte nonce (used by Companion protocol)
 */
export class Chacha20Cipher8byteNonce extends Chacha20Cipher {
  constructor(outKey: Buffer, inKey: Buffer) {
    super(outKey, inKey, 8);
  }
}

export { NONCE_LENGTH, AUTH_TAG_LENGTH };
