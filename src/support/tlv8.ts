/**
 * TLV8 encoding/decoding for HomeKit Accessory Protocol (HAP)
 *
 * TLV8 is a simple Type-Length-Value encoding used in HAP pairing.
 * Values larger than 255 bytes are split into multiple chunks.
 *
 * Ported from: pyatv/auth/hap_tlv8.py
 */

import { TlvValue } from '../types.js';

export { TlvValue };

/**
 * Error codes in HAP specification
 */
export enum ErrorCode {
  Unknown = 0x01,
  Authentication = 0x02,
  BackOff = 0x03,
  MaxPeers = 0x04,
  MaxTries = 0x05,
  Unavailable = 0x06,
  Busy = 0x07,
}

/**
 * Methods in HAP specification
 */
export enum Method {
  PairSetup = 0x00,
  PairSetupWithAuth = 0x01,
  PairVerify = 0x02,
  AddPairing = 0x03,
  RemovePairing = 0x04,
  ListPairing = 0x05,
}

/**
 * States in HAP specification
 */
export enum State {
  M1 = 0x01,
  M2 = 0x02,
  M3 = 0x03,
  M4 = 0x04,
  M5 = 0x05,
  M6 = 0x06,
}

/**
 * Flags used with TlvValue.Flags
 */
export enum Flags {
  TransientPairing = 0x10,
}

/**
 * TLV8 data structure
 */
export type TlvData = Map<number, Buffer>;

/**
 * Parse TLV8 bytes into a Map
 *
 * If a value is larger than 255 bytes, it is split into multiple chunks.
 * The same tag might occur several times and values are concatenated.
 */
export function readTlv(data: Buffer): TlvData {
  const result = new Map<number, Buffer>();
  let pos = 0;

  while (pos < data.length) {
    const tag = data[pos];
    const length = data[pos + 1];
    const value = data.subarray(pos + 2, pos + 2 + length);

    if (result.has(tag)) {
      // Concatenate with existing value (for values > 255 bytes)
      const existing = result.get(tag)!;
      result.set(tag, Buffer.concat([existing, value]));
    } else {
      result.set(tag, Buffer.from(value));
    }

    pos += 2 + length;
  }

  return result;
}

/**
 * Convert a Map to TLV8 bytes
 *
 * Values larger than 255 bytes are automatically split into chunks.
 */
export function writeTlv(data: TlvData | Record<number, Buffer>): Buffer {
  const chunks: Buffer[] = [];

  const entries = data instanceof Map ? data.entries() : Object.entries(data);

  for (const [key, value] of entries) {
    const tag = typeof key === 'string' ? parseInt(key, 10) : key;
    const valueBuffer = Buffer.isBuffer(value) ? value : Buffer.from(value);

    let pos = 0;
    let remaining = valueBuffer.length;

    // Split value into chunks of max 255 bytes
    while (remaining > 0 || pos === 0) {
      const chunkSize = Math.min(remaining, 255);
      const chunk = valueBuffer.subarray(pos, pos + chunkSize);

      chunks.push(Buffer.from([tag, chunkSize]));
      if (chunkSize > 0) {
        chunks.push(chunk);
      }

      pos += chunkSize;
      remaining -= chunkSize;

      // Handle empty value case
      if (valueBuffer.length === 0) break;
    }
  }

  return Buffer.concat(chunks);
}

/**
 * Create a simplified string representation of TLV8 data
 */
export function stringify(data: TlvData): string {
  const output: string[] = [];

  for (const [key, value] of data.entries()) {
    const keyName = TlvValue[key] ?? `0x${key.toString(16)}`;

    if (key === TlvValue.Method) {
      const method = value.readUInt8(0);
      const methodName = Method[method] ?? `0x${method.toString(16)}`;
      output.push(`${keyName}=${methodName}`);
    } else if (key === TlvValue.SeqNo) {
      const seqno = value.readUInt8(0);
      const stateName = State[seqno] ?? `0x${seqno.toString(16)}`;
      output.push(`${keyName}=${stateName}`);
    } else if (key === TlvValue.Error) {
      const code = value.readUInt8(0);
      const errorName = ErrorCode[code] ?? `0x${code.toString(16)}`;
      output.push(`${keyName}=${errorName}`);
    } else if (key === TlvValue.BackOff) {
      const seconds = value.readUInt16LE(0);
      output.push(`${keyName}=${seconds}s`);
    } else {
      output.push(`${keyName}=${value.length}bytes`);
    }
  }

  return output.join(', ');
}
