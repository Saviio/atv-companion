/**
 * Pairing procedure for Companion protocol
 *
 * Handles the SRP-based pairing flow.
 *
 * Ported from: pyatv/protocols/companion/auth.py
 */

import { CompanionProtocol } from './protocol.js';
import { FrameType } from './connection.js';
import { SRPAuthHandler } from '../auth/srp.js';
import { writeTlv, readTlv, TlvValue } from '../support/tlv8.js';
import type { HapCredentials } from '../auth/credentials.js';
import { AuthenticationError } from '../errors.js';

const PAIRING_DATA_KEY = '_pd';

/**
 * Extract and validate pairing data from message
 */
function getPairingData(message: Record<string, unknown>): Map<TlvValue, Buffer> {
  const pairingData = message[PAIRING_DATA_KEY];
  if (!pairingData) {
    throw new AuthenticationError('No pairing data in message');
  }

  if (!Buffer.isBuffer(pairingData)) {
    throw new AuthenticationError(`Pairing data has unexpected type: ${typeof pairingData}`);
  }

  const tlv = readTlv(pairingData);
  if (tlv.has(TlvValue.Error)) {
    throw new AuthenticationError(`Authentication error: ${tlv.get(TlvValue.Error)?.toString('hex')}`);
  }

  return tlv;
}

/**
 * Pair setup procedure - establishes new credentials
 */
export class CompanionPairSetupProcedure {
  private atvSalt: Buffer | null = null;
  private atvPubKey: Buffer | null = null;

  constructor(
    private protocol: CompanionProtocol,
    private srp: SRPAuthHandler
  ) {}

  /**
   * Start pairing procedure
   */
  async startPairing(): Promise<void> {
    this.srp.initialize();

    const resp = await this.protocol.exchangeAuth(FrameType.PS_Start, {
      [PAIRING_DATA_KEY]: writeTlv(
        new Map([
          [TlvValue.Method, Buffer.from([0x00])],
          [TlvValue.SeqNo, Buffer.from([0x01])],
        ])
      ),
      _pwTy: 1,
    });

    const pairingData = getPairingData(resp);
    this.atvSalt = pairingData.get(TlvValue.Salt) || null;
    this.atvPubKey = pairingData.get(TlvValue.PublicKey) || null;

    if (!this.atvSalt || !this.atvPubKey) {
      throw new AuthenticationError('Missing salt or public key from device');
    }
  }

  /**
   * Finish pairing with PIN code
   */
  async finishPairing(pinCode: string, displayName?: string): Promise<HapCredentials> {
    if (!this.atvSalt || !this.atvPubKey) {
      throw new AuthenticationError('Pairing not started');
    }

    // Step 1: Initialize SRP with PIN
    await this.srp.step1(pinCode);

    // Step 2: Process server's public key and get our proof
    const [pubKey, proof] = await this.srp.step2(this.atvPubKey, this.atvSalt);

    const resp1 = await this.protocol.exchangeAuth(FrameType.PS_Next, {
      [PAIRING_DATA_KEY]: writeTlv(
        new Map([
          [TlvValue.SeqNo, Buffer.from([0x03])],
          [TlvValue.PublicKey, pubKey],
          [TlvValue.Proof, proof],
        ])
      ),
      _pwTy: 1,
    });

    const pairingData1 = getPairingData(resp1);
    const atvProof = pairingData1.get(TlvValue.Proof);
    if (!atvProof) {
      throw new AuthenticationError('Missing proof from device');
    }

    // Step 3: Create encrypted device info
    const encryptedData = this.srp.step3(displayName);

    const resp2 = await this.protocol.exchangeAuth(FrameType.PS_Next, {
      [PAIRING_DATA_KEY]: writeTlv(
        new Map([
          [TlvValue.SeqNo, Buffer.from([0x05])],
          [TlvValue.EncryptedData, encryptedData],
        ])
      ),
      _pwTy: 1,
    });

    const pairingData2 = getPairingData(resp2);
    const responseEncrypted = pairingData2.get(TlvValue.EncryptedData);
    if (!responseEncrypted) {
      throw new AuthenticationError('Missing encrypted data from device');
    }

    // Step 4: Process response and get credentials
    return this.srp.step4(responseEncrypted);
  }
}

/**
 * Pair verify procedure - verifies existing credentials
 */
export class CompanionPairVerifyProcedure {
  constructor(
    private protocol: CompanionProtocol,
    private srp: SRPAuthHandler,
    private credentials: HapCredentials
  ) {}

  /**
   * Verify credentials with device
   */
  async verifyCredentials(): Promise<boolean> {
    const [, publicKey] = this.srp.initialize();

    const resp1 = await this.protocol.exchangeAuth(FrameType.PV_Start, {
      [PAIRING_DATA_KEY]: writeTlv(
        new Map([
          [TlvValue.SeqNo, Buffer.from([0x01])],
          [TlvValue.PublicKey, publicKey],
        ])
      ),
      _auTy: 4,
    });

    const pairingData1 = getPairingData(resp1);
    const serverPubKey = pairingData1.get(TlvValue.PublicKey);
    const encrypted = pairingData1.get(TlvValue.EncryptedData);

    if (!serverPubKey || !encrypted) {
      throw new AuthenticationError('Missing public key or encrypted data from device');
    }

    const encryptedData = this.srp.verify1(this.credentials, serverPubKey, encrypted);

    await this.protocol.exchangeAuth(FrameType.PV_Next, {
      [PAIRING_DATA_KEY]: writeTlv(
        new Map([
          [TlvValue.SeqNo, Buffer.from([0x03])],
          [TlvValue.EncryptedData, encryptedData],
        ])
      ),
    });

    return true;
  }

  /**
   * Get derived encryption keys
   */
  encryptionKeys(salt: string, outputInfo: string, inputInfo: string): [Buffer, Buffer] {
    return this.srp.verify2(salt, outputInfo, inputInfo);
  }
}
