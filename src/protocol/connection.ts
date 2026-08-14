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
import { ConnectionError } from '../errors.js';
import {
  abortError,
  operationSignal,
  operationTimeoutMs,
  timeoutError,
  type CompanionOperationOptions,
} from './operation.js';

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
  connect(options?: CompanionOperationOptions): Promise<void> {
    if (this.connected) {
      return Promise.resolve();
    }

    const timeoutMs = operationTimeoutMs(options);
    const signal = operationSignal(options);

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError(signal));
        return;
      }

      const socket = new Socket();
      this.socket = socket;
      let settled = false;

      const cleanupConnectListeners = (): void => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', handleAbort);
        socket.removeListener('connect', handleConnect);
        socket.removeListener('error', handleConnectError);
        socket.removeListener('close', handleConnectClose);
      };
      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupConnectListeners();
        socket.destroy();
        if (this.socket === socket) {
          this.socket = null;
        }
        reject(error);
      };
      const handleConnect = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupConnectListeners();
        this.emit('connected');
        resolve();
      };
      const handleConnectError = (error: Error): void => {
        fail(new ConnectionError(error.message));
      };
      const handleConnectClose = (): void => {
        fail(new ConnectionError('Connection closed before it was established'));
      };
      const handleAbort = (): void => {
        fail(abortError(signal));
      };
      const timeout = setTimeout(() => {
        fail(timeoutError(timeoutMs));
      }, timeoutMs);

      socket.once('connect', handleConnect);
      socket.once('error', handleConnectError);
      socket.once('close', handleConnectClose);

      signal?.addEventListener('abort', handleAbort, { once: true });

      socket.on('data', (data) => this.handleData(data));
      socket.on('error', (error) => {
        if (settled && this.listenerCount('error') > 0) {
          this.emit('error', error);
        }
      });
      socket.on('close', (hadError) => {
        if (this.socket === socket) {
          this.socket = null;
        }
        this.emit('disconnected', hadError ? new Error('Connection closed with error') : undefined);
      });

      socket.connect(this.port, this.host);
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
    this.buffer = Buffer.alloc(0);
    this.chacha = null;
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
