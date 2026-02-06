/**
 * Companion protocol implementation
 *
 * Handles OPACK message exchange and authentication.
 *
 * Ported from: pyatv/protocols/companion/protocol.py
 */

import { EventEmitter } from 'events';
import { CompanionConnection, FrameType } from './connection.js';
import { pack as opackPack, unpack as opackUnpack } from '../support/opack.js';
import { SRPAuthHandler } from '../auth/srp.js';
import { writeTlv, readTlv, TlvValue } from '../support/tlv8.js';
import type { HapCredentials } from '../auth/credentials.js';

const AUTH_FRAMES = [FrameType.PS_Start, FrameType.PS_Next, FrameType.PV_Start, FrameType.PV_Next];
const OPACK_FRAMES = [FrameType.U_OPACK, FrameType.E_OPACK, FrameType.P_OPACK];

const DEFAULT_TIMEOUT = 5000; // milliseconds

export const SRP_SALT = '';
export const SRP_OUTPUT_INFO = 'ClientEncrypt-main';
export const SRP_INPUT_INFO = 'ServerEncrypt-main';

/**
 * Message type values
 */
export enum MessageType {
  Event = 1,
  Request = 2,
  Response = 3,
}

type FrameIdType = number | FrameType;

interface PendingRequest {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Protocol logic for Companion
 */
export class CompanionProtocol extends EventEmitter {
  private xid: number = Math.floor(Math.random() * 65536);
  private queues: Map<FrameIdType, PendingRequest> = new Map();
  private isStarted = false;

  constructor(
    public readonly connection: CompanionConnection,
    public readonly srp: SRPAuthHandler = new SRPAuthHandler()
  ) {
    super();
    this.connection.on('frame', (frameType, data) => this.handleFrame(frameType, data));
  }

  /**
   * Connect to device and set up encryption if credentials provided
   */
  async start(credentials?: HapCredentials): Promise<void> {
    if (this.isStarted) {
      throw new Error('Already started');
    }

    this.isStarted = true;
    await this.connection.connect();

    if (credentials) {
      await this.setupEncryption(credentials);
    }
  }

  /**
   * Disconnect from device
   */
  stop(): void {
    for (const [, pending] of this.queues) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Protocol stopped'));
    }
    this.queues.clear();
    this.connection.close();
    this.isStarted = false;
  }

  /**
   * Set up encryption using pair-verify procedure
   */
  private async setupEncryption(credentials: HapCredentials): Promise<void> {
    const [, publicKey] = this.srp.initialize();

    // PV_Start - send our public key using proper TLV format
    const resp1 = await this.exchangeAuth(FrameType.PV_Start, {
      _pd: writeTlv(
        new Map([
          [TlvValue.SeqNo, Buffer.from([0x01])],
          [TlvValue.PublicKey, publicKey],
        ])
      ),
      _auTy: 4,
    });

    const pairingData1 = this.getPairingData(resp1);
    const serverPubKey = pairingData1.get(TlvValue.PublicKey);
    const encrypted = pairingData1.get(TlvValue.EncryptedData);

    if (!serverPubKey || !encrypted) {
      throw new Error('Missing server public key or encrypted data');
    }

    // Verify and create response
    const encryptedData = this.srp.verify1(credentials, serverPubKey, encrypted);

    // PV_Next - send our encrypted response using proper TLV format
    await this.exchangeAuth(FrameType.PV_Next, {
      _pd: writeTlv(
        new Map([
          [TlvValue.SeqNo, Buffer.from([0x03])],
          [TlvValue.EncryptedData, encryptedData],
        ])
      ),
    });

    // Derive encryption keys
    const [outputKey, inputKey] = this.srp.verify2(SRP_SALT, SRP_OUTPUT_INFO, SRP_INPUT_INFO);
    this.connection.enableEncryption(outputKey, inputKey);
  }

  /**
   * Exchange an auth frame (PS_* or PV_*)
   */
  async exchangeAuth(
    frameType: FrameType,
    data: Record<string, unknown>,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<Record<string, unknown>> {
    // Auth frames use *_Next for response
    let identifier: FrameType;
    if (frameType === FrameType.PS_Start) {
      identifier = FrameType.PS_Next;
    } else if (frameType === FrameType.PV_Start) {
      identifier = FrameType.PV_Next;
    } else {
      identifier = frameType;
    }
    return this.exchangeGenericOpack(frameType, data, identifier, timeout);
  }

  /**
   * Exchange an OPACK message
   */
  async exchangeOpack(
    frameType: FrameType,
    data: Record<string, unknown>,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<Record<string, unknown>> {
    data._x = this.xid;
    const identifier = this.xid;
    this.xid++;
    return this.exchangeGenericOpack(frameType, data, identifier, timeout);
  }

  /**
   * Send OPACK data without waiting for response
   */
  sendOpack(frameType: FrameType, data: Record<string, unknown>): void {
    if (!('_x' in data)) {
      data._x = this.xid++;
    }
    this.connection.send(frameType, opackPack(data));
  }

  private async exchangeGenericOpack(
    frameType: FrameType,
    data: Record<string, unknown>,
    identifier: FrameIdType,
    timeout: number
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.queues.delete(identifier);
        reject(new Error(`Timeout waiting for response (${timeout}ms)`));
      }, timeout);

      this.queues.set(identifier, { resolve, reject, timeout: timeoutId });
      this.connection.send(frameType, opackPack(data));
    });
  }

  private handleFrame(frameType: FrameType, data: Buffer): void {
    if (!OPACK_FRAMES.includes(frameType) && !AUTH_FRAMES.includes(frameType)) {
      return;
    }

    try {
      const [opackData] = opackUnpack(data);

      if (typeof opackData !== 'object' || opackData === null) {
        return;
      }

      const record = opackData as Record<string, unknown>;

      if (AUTH_FRAMES.includes(frameType)) {
        this.handleAuth(frameType, record);
      } else {
        this.handleOpack(record);
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  private handleAuth(frameType: FrameType, data: Record<string, unknown>): void {
    const pending = this.queues.get(frameType);
    if (pending) {
      this.queues.delete(frameType);
      clearTimeout(pending.timeout);
      pending.resolve(data);
    }
  }

  private handleOpack(data: Record<string, unknown>): void {
    const messageType = Number(data._t);

    if (messageType === MessageType.Event) {
      this.emit('event', data._i, data._c);
    } else if (messageType === MessageType.Response) {
      const xid = Number(data._x);
      const pending = this.queues.get(xid);
      if (pending) {
        this.queues.delete(xid);
        clearTimeout(pending.timeout);

        if ('_em' in data) {
          pending.reject(new Error(`Command failed: ${data._em}`));
        } else {
          pending.resolve(data);
        }
      }
    }
  }

  private getPairingData(message: Record<string, unknown>): Map<number, Buffer> {
    const pd = message._pd;
    if (!Buffer.isBuffer(pd)) {
      throw new Error('No pairing data in message');
    }

    // Use proper TLV parsing from tlv8.ts
    return readTlv(pd);
  }
}
