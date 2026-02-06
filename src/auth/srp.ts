/**
 * SRP authentication handler for HAP pairing
 *
 * Implements SRP-6a protocol for Apple TV pairing.
 * Uses js-srp6a with 3072-bit prime and SHA-512.
 *
 * Ported from: pyatv/auth/hap_srp.py
 */

import { default as srp6a } from 'js-srp6a';
import { v4 as uuidv4 } from 'uuid';
import {
  generateEd25519KeyPair,
  generateX25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  x25519SharedSecret,
  hkdfExpand,
} from '../support/crypto.js';
import { Chacha20Cipher8byteNonce } from '../support/chacha20.js';
import { readTlv, writeTlv, TlvValue } from '../support/tlv8.js';
import { pack as opackPack } from '../support/opack.js';
import { AuthenticationError } from '../errors.js';
import type { HapCredentials } from './credentials.js';

// SRP-3072 prime (RFC 5054)
const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF';
const N = BigInt('0x' + N_HEX);
const G = 5n;

/**
 * Compute A = g^a mod N (client public ephemeral)
 */
function computePublicEphemeral(secretHex: string): string {
  const a = BigInt('0x' + secretHex);
  const A = modPow(G, a, N);
  return A.toString(16).padStart(768, '0');
}

/**
 * Modular exponentiation: base^exp mod mod
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * SRP authentication handler for pairing and verification
 */
export class SRPAuthHandler {
  readonly pairingId: Buffer;

  private signingKey: { privateKey: Buffer; publicKey: Buffer } | null = null;
  private verifyKey: { privateKey: Buffer; publicKey: Buffer } | null = null;

  private srpClient: ReturnType<typeof srp6a.createSRPClient> | null = null;
  private srpSession: { key: string; proof: string } | null = null;
  private sessionKey: Buffer | null = null;
  private sharedSecret: Buffer | null = null;

  constructor() {
    this.pairingId = Buffer.from(uuidv4());
  }

  /**
   * Get the shared session key (K) as bytes
   */
  get sharedKey(): Buffer {
    if (!this.srpSession) {
      throw new Error('SRP session not established');
    }
    return Buffer.from(this.srpSession.key, 'hex');
  }

  /**
   * Initialize operation by generating new keys
   * @returns Tuple of [authPublicKey, verifyPublicKey]
   */
  initialize(): [Buffer, Buffer] {
    this.signingKey = generateEd25519KeyPair();
    this.verifyKey = generateX25519KeyPair();

    return [this.signingKey.publicKey, this.verifyKey.publicKey];
  }

  /**
   * First verification step - process server's verify response
   */
  verify1(credentials: HapCredentials, sessionPubKey: Buffer, encrypted: Buffer): Buffer {
    if (!this.verifyKey) {
      throw new Error('Keys not initialized');
    }

    // Perform X25519 key exchange
    this.sharedSecret = x25519SharedSecret(this.verifyKey.privateKey, sessionPubKey);

    // Derive session key
    const sessionKey = hkdfExpand(
      'Pair-Verify-Encrypt-Salt',
      'Pair-Verify-Encrypt-Info',
      this.sharedSecret
    );

    // Decrypt TLV
    const chacha = new Chacha20Cipher8byteNonce(sessionKey, sessionKey);
    const decryptedTlv = readTlv(chacha.decrypt(encrypted, 'PV-Msg02'));

    const identifier = decryptedTlv.get(TlvValue.Identifier);
    const signature = decryptedTlv.get(TlvValue.Signature);

    if (!identifier || !signature) {
      throw new AuthenticationError('Missing identifier or signature in response');
    }

    // Verify identifier matches
    if (!identifier.equals(credentials.atvId)) {
      throw new AuthenticationError('Incorrect device response');
    }

    // Verify signature
    const info = Buffer.concat([sessionPubKey, identifier, this.verifyKey.publicKey]);

    if (!ed25519Verify(credentials.ltpk, info, signature)) {
      throw new AuthenticationError('Signature verification failed');
    }

    // Create our response
    const deviceInfo = Buffer.concat([
      this.verifyKey.publicKey,
      credentials.clientId,
      sessionPubKey,
    ]);

    const deviceSignature = ed25519Sign(credentials.ltsk, deviceInfo);

    const tlv = writeTlv(
      new Map([
        [TlvValue.Identifier, credentials.clientId],
        [TlvValue.Signature, deviceSignature],
      ])
    );

    return chacha.encrypt(tlv, 'PV-Msg03');
  }

  /**
   * Last verification step - derive encryption keys
   * @returns Tuple of [outputKey, inputKey]
   */
  verify2(salt: string, outputInfo: string, inputInfo: string): [Buffer, Buffer] {
    if (!this.sharedSecret) {
      throw new Error('Shared secret not established');
    }

    const outputKey = hkdfExpand(salt, outputInfo, this.sharedSecret);
    const inputKey = hkdfExpand(salt, inputInfo, this.sharedSecret);

    return [outputKey, inputKey];
  }

  private pin: string | null = null;
  private srpEphemeral: { secret: string; public: string } | null = null;

  /**
   * First pairing step - initialize SRP with PIN
   */
  async step1(pin: string): Promise<void> {
    if (!this.signingKey) {
      throw new Error('Keys not initialized');
    }

    this.srpClient = srp6a.createSRPClient('SHA-512', 3072);
    this.pin = pin;

    // Generate ephemeral keys (a, A) - use signing key private bytes as the secret
    // This matches pyatv's behavior: binascii.hexlify(self._auth_private).decode()
    this.srpEphemeral = {
      secret: this.signingKey.privateKey.toString('hex'),
      public: '', // Will be computed in step2
    };
  }

  /**
   * Second pairing step - process server's public key and salt
   * @returns Tuple of [clientPublicKey, clientProof]
   */
  async step2(atvPubKey: Buffer, atvSalt: Buffer): Promise<[Buffer, Buffer]> {
    if (!this.srpClient || !this.srpEphemeral || !this.pin) {
      throw new Error('SRP not initialized');
    }

    const pkStr = atvPubKey.toString('hex');
    const saltStr = atvSalt.toString('hex');

    // Derive private key (x) from salt, username, and password (PIN)
    const x = await this.srpClient.derivePrivateKey(saltStr, 'Pair-Setup', this.pin);

    // Derive session using our ephemeral secret 'a', server's public key 'B', salt, username, and x
    this.srpSession = await this.srpClient.deriveSession(
      this.srpEphemeral.secret,
      pkStr,
      saltStr,
      'Pair-Setup',
      x
    );

    // Compute our public key A = g^a mod N
    const clientPubKeyHex = computePublicEphemeral(this.srpEphemeral.secret);
    const clientPubKey = Buffer.from(clientPubKeyHex, 'hex');
    const proof = Buffer.from(this.srpSession.proof, 'hex');

    return [clientPubKey, proof];
  }

  /**
   * Third pairing step - create encrypted device info
   * @param name - Optional device name
   * @param additionalData - Optional additional TLV data
   */
  step3(name?: string, additionalData?: Map<TlvValue, Buffer>): Buffer {
    if (!this.srpSession || !this.signingKey) {
      throw new Error('SRP session not established');
    }

    const sessionKeyBytes = Buffer.from(this.srpSession.key, 'hex');

    // Derive signing key
    const iosDeviceX = hkdfExpand(
      'Pair-Setup-Controller-Sign-Salt',
      'Pair-Setup-Controller-Sign-Info',
      sessionKeyBytes
    );

    // Derive encryption key
    this.sessionKey = hkdfExpand(
      'Pair-Setup-Encrypt-Salt',
      'Pair-Setup-Encrypt-Info',
      sessionKeyBytes
    );

    // Create device info and sign it
    const deviceInfo = Buffer.concat([iosDeviceX, this.pairingId, this.signingKey.publicKey]);
    const deviceSignature = ed25519Sign(this.signingKey.privateKey, deviceInfo);

    // Build TLV
    const tlv = new Map<TlvValue, Buffer>([
      [TlvValue.Identifier, this.pairingId],
      [TlvValue.PublicKey, this.signingKey.publicKey],
      [TlvValue.Signature, deviceSignature],
    ]);

    if (name) {
      tlv.set(TlvValue.Name, opackPack({ name }));
    }

    if (additionalData) {
      for (const [key, value] of additionalData) {
        tlv.set(key, value);
      }
    }

    // Encrypt and return
    const chacha = new Chacha20Cipher8byteNonce(this.sessionKey, this.sessionKey);
    return chacha.encrypt(writeTlv(tlv), 'PS-Msg05');
  }

  /**
   * Last pairing step - process server's encrypted response
   * @returns HAP credentials for future connections
   */
  step4(encryptedData: Buffer): HapCredentials {
    if (!this.sessionKey || !this.signingKey) {
      throw new Error('Session key not established');
    }

    const chacha = new Chacha20Cipher8byteNonce(this.sessionKey, this.sessionKey);
    const decryptedTlvBytes = chacha.decrypt(encryptedData, 'PS-Msg06');

    if (!decryptedTlvBytes || decryptedTlvBytes.length === 0) {
      throw new AuthenticationError('Data decrypt failed');
    }

    const decryptedTlv = readTlv(decryptedTlvBytes);

    const atvIdentifier = decryptedTlv.get(TlvValue.Identifier);
    const atvPubKey = decryptedTlv.get(TlvValue.PublicKey);

    if (!atvIdentifier || !atvPubKey) {
      throw new AuthenticationError('Missing identifier or public key in response');
    }

    // TODO: verify signature here (optional, pyatv doesn't do it either)

    return {
      ltpk: atvPubKey,
      ltsk: this.signingKey.privateKey,
      atvId: atvIdentifier,
      clientId: this.pairingId,
    };
  }
}