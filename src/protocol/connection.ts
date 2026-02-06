/**
 * Connection abstraction for Companion protocol
 *
 * Handles TCP connection, frame parsing, and encryption.
 *
 * Ported from: pyatv/protocols/companion/connection.py
 */

import { Socket } from 'net';
import { EventEmitter } from 'events';
import { Chacha20Cipher } from '../support/chacha20.js';

const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = 4;

/**
 * Frame type values for Companion protocol
 */
export enum FrameType {
  Unknown = 0,
  NoOp = 1,
  PS_Start = 3,
  PS_Next = 4,
  PV_Start = 5,
  PV_Next = 6,
  U_OPACK = 7,
  E_OPACK = 8,
  P_OPACK = 9,
  PA_Req = 10,
  PA_Rsp = 11,
  SessionStartRequest = 16,
  SessionStartResponse = 17,
  SessionData = 18,
  FamilyIdentityRequest = 32,
  FamilyIdentityResponse = 33,
  FamilyIdentityUpdate = 34,
}

export interface CompanionConnectionEvents {
  frame: (frameType: FrameType, data: Buffer) => void;
  connected: () => void;
  disconnected: (error?: Error) => void;
  error: (error: Error) => void;
}

/**
 * Remote connection to a Companion device
 */
export class CompanionConnection extends EventEmitter {
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private chacha: Chacha20Cipher | null = null;

  constructor(
    public readonly host: string,
    public readonly port: number
  ) {
    super();
  }

  /**
   * Check if connection is open
   */
  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /**
   * Connect to device
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket();

      this.socket.once('connect', () => {
        this.emit('connected');
        resolve();
      });

      this.socket.once('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('data', (data) => this.handleData(data));

      this.socket.on('close', (hadError) => {
        this.socket = null;
        this.emit('disconnected', hadError ? new Error('Connection closed with error') : undefined);
      });

      this.socket.connect(this.port, this.host);
    });
  }

  /**
   * Close connection to device
   */
  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /**
   * Enable encryption with the specified keys
   */
  enableEncryption(outputKey: Buffer, inputKey: Buffer): void {
    this.chacha = new Chacha20Cipher(outputKey, inputKey, 12);
  }

  /**
   * Send frame to device
   */
  send(frameType: FrameType, data: Buffer): void {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    let payloadLength = data.length;
    if (this.chacha && payloadLength > 0) {
      payloadLength += AUTH_TAG_LENGTH;
    }

    // Build header: 1 byte frame type + 3 bytes payload length (big endian)
    const header = Buffer.alloc(HEADER_LENGTH);
    header[0] = frameType;
    header.writeUIntBE(payloadLength, 1, 3);

    let payload = data;
    if (this.chacha && data.length > 0) {
      payload = this.chacha.encrypt(data, undefined, header);
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  /**
   * Handle incoming data
   */
  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= HEADER_LENGTH) {
      const payloadLength = HEADER_LENGTH + this.buffer.readUIntBE(1, 3);

      if (this.buffer.length < payloadLength) {
        // Not enough data yet
        break;
      }

      const header = this.buffer.subarray(0, HEADER_LENGTH);
      let payload = this.buffer.subarray(HEADER_LENGTH, payloadLength);
      this.buffer = this.buffer.subarray(payloadLength);

      try {
        if (this.chacha && payload.length > 0) {
          payload = this.chacha.decrypt(payload, undefined, header);
        }

        const frameType = header[0] as FrameType;
        this.emit('frame', frameType, payload);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

export { AUTH_TAG_LENGTH, HEADER_LENGTH };
