/**
 * Crypto utilities tests
 *
 * Test vectors generated from pyatv's cryptography implementation
 * to ensure TypeScript implementation matches Python behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  hkdfExpand,
  generateEd25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  ed25519GetPublicKey,
  generateX25519KeyPair,
  x25519SharedSecret,
  x25519GetPublicKey,
} from '../../src/support/crypto.js';

// HKDF test vectors from pyatv
const hkdfTestVectors = {
  sessionKey:
    'f4e167b25ae84df7fb5d21af8a944b47d749b9277f7f7107b417bfb3b2f53a83e880348c5bf3cf714515d0ae9e085c743def46d4f1b0efa7109fd7dd25860358',
  iosDeviceX: '76c5fd40535ada18a47016e8ee6f92d6ab6eef81bee5a6634d7e7ad07d2cae51',
  sessionEncryptKey: '417302662cc5cd7d3a189e130c00e621a53b91c5a89bbd4eaccc39a621baaad4',
  sharedSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  verifySessionKey: 'f2373826dcae54153c516af26955924422e0006690031cf931c54c9d3a6efa4e',
};

describe('Crypto', () => {
  describe('hkdfExpand', () => {
    it('should derive Pair-Setup-Controller-Sign key matching pyatv', () => {
      const sessionKey = Buffer.from(hkdfTestVectors.sessionKey, 'hex');
      const derived = hkdfExpand(
        'Pair-Setup-Controller-Sign-Salt',
        'Pair-Setup-Controller-Sign-Info',
        sessionKey
      );
      expect(derived.toString('hex')).toBe(hkdfTestVectors.iosDeviceX);
    });

    it('should derive Pair-Setup-Encrypt key matching pyatv', () => {
      const sessionKey = Buffer.from(hkdfTestVectors.sessionKey, 'hex');
      const derived = hkdfExpand(
        'Pair-Setup-Encrypt-Salt',
        'Pair-Setup-Encrypt-Info',
        sessionKey
      );
      expect(derived.toString('hex')).toBe(hkdfTestVectors.sessionEncryptKey);
    });

    it('should derive Pair-Verify-Encrypt key matching pyatv', () => {
      const sharedSecret = Buffer.from(hkdfTestVectors.sharedSecret, 'hex');
      const derived = hkdfExpand(
        'Pair-Verify-Encrypt-Salt',
        'Pair-Verify-Encrypt-Info',
        sharedSecret
      );
      expect(derived.toString('hex')).toBe(hkdfTestVectors.verifySessionKey);
    });

    it('should produce 32-byte output', () => {
      const input = Buffer.from('test input', 'utf-8');
      const derived = hkdfExpand('salt', 'info', input);
      expect(derived.length).toBe(32);
    });
  });

  describe('Ed25519', () => {
    it('should generate valid key pair', () => {
      const keyPair = generateEd25519KeyPair();
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    it('should derive public key from private key', () => {
      const keyPair = generateEd25519KeyPair();
      const derivedPublic = ed25519GetPublicKey(keyPair.privateKey);
      expect(derivedPublic.equals(keyPair.publicKey)).toBe(true);
    });

    it('should sign and verify message', () => {
      const keyPair = generateEd25519KeyPair();
      const message = Buffer.from('test message', 'utf-8');
      const signature = ed25519Sign(keyPair.privateKey, message);

      expect(signature.length).toBe(64);
      expect(ed25519Verify(keyPair.publicKey, message, signature)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const keyPair = generateEd25519KeyPair();
      const message = Buffer.from('test message', 'utf-8');
      const signature = ed25519Sign(keyPair.privateKey, message);

      // Modify signature
      signature[0] ^= 0xff;
      expect(ed25519Verify(keyPair.publicKey, message, signature)).toBe(false);
    });

    it('should reject wrong message', () => {
      const keyPair = generateEd25519KeyPair();
      const message = Buffer.from('test message', 'utf-8');
      const wrongMessage = Buffer.from('wrong message', 'utf-8');
      const signature = ed25519Sign(keyPair.privateKey, message);

      expect(ed25519Verify(keyPair.publicKey, wrongMessage, signature)).toBe(false);
    });
  });

  describe('X25519', () => {
    it('should generate valid key pair', () => {
      const keyPair = generateX25519KeyPair();
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    it('should derive public key from private key', () => {
      const keyPair = generateX25519KeyPair();
      const derivedPublic = x25519GetPublicKey(keyPair.privateKey);
      expect(derivedPublic.equals(keyPair.publicKey)).toBe(true);
    });

    it('should compute shared secret (Diffie-Hellman)', () => {
      const alice = generateX25519KeyPair();
      const bob = generateX25519KeyPair();

      const aliceShared = x25519SharedSecret(alice.privateKey, bob.publicKey);
      const bobShared = x25519SharedSecret(bob.privateKey, alice.publicKey);

      expect(aliceShared.length).toBe(32);
      expect(aliceShared.equals(bobShared)).toBe(true);
    });
  });
});
