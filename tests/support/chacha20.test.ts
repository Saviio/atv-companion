/**
 * ChaCha20 encryption tests
 * Ported from: tests/support/test_chacha20.py
 */

import { describe, it, expect } from 'vitest';
import { Chacha20Cipher, Chacha20Cipher8byteNonce, NONCE_LENGTH } from '../../src/support/chacha20.js';

const fakeKey = Buffer.alloc(32, 0x6b); // 'k' * 32

describe('Chacha20Cipher', () => {
  it('should use 12 bytes nonce', () => {
    const cipher = new Chacha20Cipher(fakeKey, fakeKey, 12);
    expect(cipher.outNonce.length).toBe(NONCE_LENGTH);
    expect(cipher.inNonce.length).toBe(NONCE_LENGTH);

    const encrypted = cipher.encrypt(Buffer.from('test'));
    const decrypted = cipher.decrypt(encrypted);
    expect(decrypted.toString()).toBe('test');
  });

  it('should use 8 bytes nonce', () => {
    const cipher = new Chacha20Cipher8byteNonce(fakeKey, fakeKey);
    expect(cipher.outNonce.length).toBe(NONCE_LENGTH);
    expect(cipher.inNonce.length).toBe(NONCE_LENGTH);

    const encrypted = cipher.encrypt(Buffer.from('test'));
    const decrypted = cipher.decrypt(encrypted);
    expect(decrypted.toString()).toBe('test');
  });

  it('should encrypt and decrypt with custom nonce', () => {
    const cipher = new Chacha20Cipher8byteNonce(fakeKey, fakeKey);
    const nonce = 'PV-Msg02';

    const encrypted = cipher.encrypt(Buffer.from('hello world'), nonce);
    const decrypted = cipher.decrypt(encrypted, nonce);
    expect(decrypted.toString()).toBe('hello world');
  });

  it('should encrypt and decrypt with AAD', () => {
    const cipher = new Chacha20Cipher(fakeKey, fakeKey, 12);
    const aad = Buffer.from([0x08, 0x00, 0x00, 0x10]);

    const encrypted = cipher.encrypt(Buffer.from('test data'), undefined, aad);
    const decrypted = cipher.decrypt(encrypted, undefined, aad);
    expect(decrypted.toString()).toBe('test data');
  });

  it('should increment counters', () => {
    const cipher = new Chacha20Cipher(fakeKey, fakeKey, 12);

    // First encryption
    const nonce1 = Buffer.from(cipher.outNonce);
    cipher.encrypt(Buffer.from('test1'));
    const nonce2 = Buffer.from(cipher.outNonce);

    expect(nonce1).not.toEqual(nonce2);

    // Verify out counter incremented
    expect(nonce2.readBigUInt64LE(0)).toBe(1n);

    // First decryption - use a separate cipher to test decrypt counter
    const cipher2 = new Chacha20Cipher(fakeKey, fakeKey, 12);
    const encrypted = cipher2.encrypt(Buffer.from('test2'));

    const inNonce1 = Buffer.from(cipher2.inNonce);
    cipher2.decrypt(encrypted);
    const inNonce2 = Buffer.from(cipher2.inNonce);

    expect(inNonce1).not.toEqual(inNonce2);
    expect(inNonce2.readBigUInt64LE(0)).toBe(1n);
  });
});
