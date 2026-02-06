/**
 * OPACK serialization format implementation
 *
 * OPACK is Apple's proprietary binary serialization format used in the Companion protocol.
 * Similar to MessagePack but with Apple-specific extensions.
 *
 * Ported from: pyatv/support/opack.py
 */

/**
 * Sized integer - preserves original encoded size for re-encoding
 */
export class SizedInt {
  constructor(
    public readonly value: number,
    public readonly size: number
  ) {}

  valueOf(): number {
    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * Pack a JavaScript value into OPACK format
 */
export function pack(data: unknown): Buffer {
  return packInternal(data, []);
}

function packInternal(data: unknown, objectList: Buffer[]): Buffer {
  let packedBytes: Buffer;

  if (data === null || data === undefined) {
    packedBytes = Buffer.from([0x04]);
  } else if (typeof data === 'boolean') {
    packedBytes = Buffer.from([data ? 0x01 : 0x02]);
  } else if (data instanceof Date) {
    // Datetime objects are not supported (matching Python behavior)
    throw new TypeError('Packing datetime objects is not supported');
  } else if (data instanceof Uint8Array && 'uuid' in data) {
    // UUID (16 bytes)
    packedBytes = Buffer.concat([Buffer.from([0x05]), Buffer.from(data as Uint8Array)]);
  } else if (data instanceof SizedInt) {
    // SizedInt - pack with specified size
    packedBytes = packInteger(data.value, data.size);
  } else if (typeof data === 'number') {
    if (Number.isInteger(data)) {
      packedBytes = packInteger(data, null);
    } else {
      // Float64
      packedBytes = Buffer.alloc(9);
      packedBytes[0] = 0x36;
      packedBytes.writeDoubleLE(data, 1);
    }
  } else if (typeof data === 'string') {
    packedBytes = packString(data);
  } else if (Buffer.isBuffer(data)) {
    packedBytes = packBytes(data);
  } else if (data instanceof Uint8Array) {
    packedBytes = packBytes(Buffer.from(data));
  } else if (Array.isArray(data)) {
    packedBytes = packArray(data, objectList);
  } else if (typeof data === 'object' && data !== null) {
    // Check for plain objects only - reject Set, Map, etc.
    if (data.constructor !== Object) {
      throw new TypeError(`Unsupported type: ${data.constructor.name}`);
    }
    packedBytes = packDict(data as Record<string, unknown>, objectList);
  } else {
    throw new TypeError(`Unsupported type: ${typeof data}`);
  }

  // Object reference deduplication
  const existingIndex = objectList.findIndex((buf) => buf.equals(packedBytes));
  if (existingIndex !== -1) {
    if (existingIndex < 0x21) {
      packedBytes = Buffer.from([0xa0 + existingIndex]);
    } else if (existingIndex <= 0xff) {
      packedBytes = Buffer.alloc(2);
      packedBytes[0] = 0xc1;
      packedBytes.writeUInt8(existingIndex, 1);
    } else if (existingIndex <= 0xffff) {
      packedBytes = Buffer.alloc(3);
      packedBytes[0] = 0xc2;
      packedBytes.writeUInt16LE(existingIndex, 1);
    } else if (existingIndex <= 0xffffffff) {
      packedBytes = Buffer.alloc(5);
      packedBytes[0] = 0xc3;
      packedBytes.writeUInt32LE(existingIndex, 1);
    }
  } else if (packedBytes.length > 1) {
    objectList.push(packedBytes);
  }

  return packedBytes;
}

function packInteger(value: number, sizeHint: number | null): Buffer {
  if (value < 0x28 && !sizeHint) {
    return Buffer.from([value + 8]);
  } else if ((value <= 0xff && !sizeHint) || sizeHint === 1) {
    const buf = Buffer.alloc(2);
    buf[0] = 0x30;
    buf.writeUInt8(value, 1);
    return buf;
  } else if ((value <= 0xffff && !sizeHint) || sizeHint === 2) {
    const buf = Buffer.alloc(3);
    buf[0] = 0x31;
    buf.writeUInt16LE(value, 1);
    return buf;
  } else if ((value <= 0xffffffff && !sizeHint) || sizeHint === 4) {
    const buf = Buffer.alloc(5);
    buf[0] = 0x32;
    buf.writeUInt32LE(value, 1);
    return buf;
  } else {
    const buf = Buffer.alloc(9);
    buf[0] = 0x33;
    buf.writeBigUInt64LE(BigInt(value), 1);
    return buf;
  }
}

function packString(data: string): Buffer {
  const encoded = Buffer.from(data, 'utf-8');
  const len = encoded.length;

  if (len <= 0x20) {
    return Buffer.concat([Buffer.from([0x40 + len]), encoded]);
  } else if (len <= 0xff) {
    const header = Buffer.alloc(2);
    header[0] = 0x61;
    header.writeUInt8(len, 1);
    return Buffer.concat([header, encoded]);
  } else if (len <= 0xffff) {
    const header = Buffer.alloc(3);
    header[0] = 0x62;
    header.writeUInt16LE(len, 1);
    return Buffer.concat([header, encoded]);
  } else if (len <= 0xffffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x63;
    header.writeUIntLE(len, 1, 3);
    return Buffer.concat([header, encoded]);
  } else {
    const header = Buffer.alloc(5);
    header[0] = 0x64;
    header.writeUInt32LE(len, 1);
    return Buffer.concat([header, encoded]);
  }
}

function packBytes(data: Buffer): Buffer {
  const len = data.length;

  if (len <= 0x20) {
    return Buffer.concat([Buffer.from([0x70 + len]), data]);
  } else if (len <= 0xff) {
    const header = Buffer.alloc(2);
    header[0] = 0x91;
    header.writeUInt8(len, 1);
    return Buffer.concat([header, data]);
  } else if (len <= 0xffff) {
    const header = Buffer.alloc(3);
    header[0] = 0x92;
    header.writeUInt16LE(len, 1);
    return Buffer.concat([header, data]);
  } else if (len <= 0xffffffff) {
    const header = Buffer.alloc(5);
    header[0] = 0x93;
    header.writeUInt32LE(len, 1);
    return Buffer.concat([header, data]);
  } else {
    const header = Buffer.alloc(9);
    header[0] = 0x94;
    header.writeBigUInt64LE(BigInt(len), 1);
    return Buffer.concat([header, data]);
  }
}

function packArray(data: unknown[], objectList: Buffer[]): Buffer {
  const count = Math.min(data.length, 0xf);
  const header = Buffer.from([0xd0 + count]);
  const items = data.map((item) => packInternal(item, objectList));
  const result = Buffer.concat([header, ...items]);

  if (data.length >= 0xf) {
    return Buffer.concat([result, Buffer.from([0x03])]);
  }
  return result;
}

function packDict(data: Record<string, unknown>, objectList: Buffer[]): Buffer {
  const entries = Object.entries(data);
  const count = Math.min(entries.length, 0xf);
  const header = Buffer.from([0xe0 + count]);

  const items: Buffer[] = [];
  for (const [key, value] of entries) {
    items.push(packInternal(key, objectList));
    items.push(packInternal(value, objectList));
  }

  const result = Buffer.concat([header, ...items]);

  if (entries.length >= 0xf) {
    return Buffer.concat([result, Buffer.from([0x03])]);
  }
  return result;
}

/**
 * Unpack OPACK data into JavaScript values
 * @returns Tuple of [value, remaining bytes]
 */
export function unpack(data: Buffer): [unknown, Buffer] {
  return unpackInternal(data, []);
}

function unpackInternal(data: Buffer, objectList: unknown[]): [unknown, Buffer] {
  let value: unknown = null;
  let remaining: Buffer;
  let addToObjectList = true;

  const tag = data[0];

  if (tag === 0x01) {
    value = true;
    remaining = data.subarray(1);
    addToObjectList = false;
  } else if (tag === 0x02) {
    value = false;
    remaining = data.subarray(1);
    addToObjectList = false;
  } else if (tag === 0x04) {
    value = null;
    remaining = data.subarray(1);
    addToObjectList = false;
  } else if (tag === 0x05) {
    // UUID (16 bytes)
    value = data.subarray(1, 17).toString('hex');
    remaining = data.subarray(17);
  } else if (tag === 0x06) {
    // Absolute time (parse as integer for now)
    value = Number(data.readBigUInt64LE(1));
    remaining = data.subarray(9);
  } else if (tag >= 0x08 && tag <= 0x2f) {
    // Small integer (0-39)
    value = tag - 8;
    remaining = data.subarray(1);
    addToObjectList = false;
  } else if (tag === 0x35) {
    // Float32
    value = data.readFloatLE(1);
    remaining = data.subarray(5);
  } else if (tag === 0x36) {
    // Float64
    value = data.readDoubleLE(1);
    remaining = data.subarray(9);
  } else if ((tag & 0xf0) === 0x30) {
    // Sized integer
    const numBytes = 1 << (tag & 0xf);
    let intValue: number;
    if (numBytes === 1) {
      intValue = data.readUInt8(1);
    } else if (numBytes === 2) {
      intValue = data.readUInt16LE(1);
    } else if (numBytes === 4) {
      intValue = data.readUInt32LE(1);
    } else {
      intValue = Number(data.readBigUInt64LE(1));
    }
    value = new SizedInt(intValue, numBytes);
    remaining = data.subarray(1 + numBytes);
  } else if (tag >= 0x40 && tag <= 0x60) {
    // Short string (0-32 bytes)
    const length = tag - 0x40;
    value = data.subarray(1, 1 + length).toString('utf-8');
    remaining = data.subarray(1 + length);
  } else if (tag > 0x60 && tag <= 0x64) {
    // Long string
    const numBytes = tag & 0xf;
    let length: number;
    if (numBytes === 1) {
      length = data.readUInt8(1);
    } else if (numBytes === 2) {
      length = data.readUInt16LE(1);
    } else if (numBytes === 3) {
      length = data.readUIntLE(1, 3);
    } else {
      length = data.readUInt32LE(1);
    }
    value = data.subarray(1 + numBytes, 1 + numBytes + length).toString('utf-8');
    remaining = data.subarray(1 + numBytes + length);
  } else if (tag >= 0x70 && tag <= 0x90) {
    // Short bytes (0-32 bytes)
    const length = tag - 0x70;
    value = data.subarray(1, 1 + length);
    remaining = data.subarray(1 + length);
  } else if (tag >= 0x91 && tag <= 0x94) {
    // Long bytes
    const numBytes = 1 << ((tag & 0xf) - 1);
    let length: number;
    if (numBytes === 1) {
      length = data.readUInt8(1);
    } else if (numBytes === 2) {
      length = data.readUInt16LE(1);
    } else if (numBytes === 4) {
      length = data.readUInt32LE(1);
    } else {
      length = Number(data.readBigUInt64LE(1));
    }
    value = data.subarray(1 + numBytes, 1 + numBytes + length);
    remaining = data.subarray(1 + numBytes + length);
  } else if ((tag & 0xf0) === 0xd0) {
    // Array
    const count = tag & 0xf;
    const output: unknown[] = [];
    let ptr = data.subarray(1);

    if (count === 0xf) {
      // Endless array
      while (ptr[0] !== 0x03) {
        const [item, rest] = unpackInternal(ptr, objectList);
        output.push(item);
        ptr = rest;
      }
      ptr = ptr.subarray(1); // Skip terminator
    } else {
      for (let i = 0; i < count; i++) {
        const [item, rest] = unpackInternal(ptr, objectList);
        output.push(item);
        ptr = rest;
      }
    }
    value = output;
    remaining = ptr;
    addToObjectList = false;
  } else if ((tag & 0xe0) === 0xe0) {
    // Dict
    const count = tag & 0xf;
    const output: Record<string, unknown> = {};
    let ptr = data.subarray(1);

    if (count === 0xf) {
      // Endless dict
      while (ptr[0] !== 0x03) {
        const [key, rest1] = unpackInternal(ptr, objectList);
        const [val, rest2] = unpackInternal(rest1, objectList);
        output[String(key)] = val;
        ptr = rest2;
      }
      ptr = ptr.subarray(1); // Skip terminator
    } else {
      for (let i = 0; i < count; i++) {
        const [key, rest1] = unpackInternal(ptr, objectList);
        const [val, rest2] = unpackInternal(rest1, objectList);
        output[String(key)] = val;
        ptr = rest2;
      }
    }
    value = output;
    remaining = ptr;
    addToObjectList = false;
  } else if (tag >= 0xa0 && tag <= 0xc0) {
    // Object reference (short)
    const index = tag - 0xa0;
    value = objectList[index];
    remaining = data.subarray(1);
  } else if (tag >= 0xc1 && tag <= 0xc4) {
    // Object reference (long)
    const numBytes = tag - 0xc0;
    let index: number;
    if (numBytes === 1) {
      index = data.readUInt8(1);
    } else if (numBytes === 2) {
      index = data.readUInt16LE(1);
    } else if (numBytes === 3) {
      index = data.readUIntLE(1, 3);
    } else {
      index = data.readUInt32LE(1);
    }
    value = objectList[index];
    remaining = data.subarray(1 + numBytes);
  } else {
    throw new TypeError(`Unknown OPACK tag: 0x${tag.toString(16)}`);
  }

  if (addToObjectList && !objectList.includes(value)) {
    objectList.push(value);
  }

  return [value, remaining];
}
