/**
 * OPACK serialization tests
 * Ported from: tests/support/test_opack.py
 */

import { describe, it, expect } from 'vitest';
import { pack, unpack, SizedInt } from '../../src/support/opack.js';

// Helper to create UUID-like Uint8Array
function createUUID(hex: string): Uint8Array & { uuid: true } {
  const bytes = Buffer.from(hex.replace(/-/g, ''), 'hex');
  const arr = new Uint8Array(bytes) as Uint8Array & { uuid: true };
  (arr as { uuid: boolean }).uuid = true;
  return arr;
}

describe('OPACK pack', () => {
  it('should throw on unsupported type', () => {
    expect(() => pack(new Set())).toThrow(TypeError);
  });

  it('should pack boolean', () => {
    expect(pack(true)).toEqual(Buffer.from([0x01]));
    expect(pack(false)).toEqual(Buffer.from([0x02]));
  });

  it('should pack null', () => {
    expect(pack(null)).toEqual(Buffer.from([0x04]));
  });

  it('should pack small integers', () => {
    expect(pack(0)).toEqual(Buffer.from([0x08]));
    expect(pack(0xf)).toEqual(Buffer.from([0x17]));
    expect(pack(0x27)).toEqual(Buffer.from([0x2f]));
  });

  it('should pack larger integers', () => {
    expect(pack(0x28)).toEqual(Buffer.from([0x30, 0x28]));
    expect(pack(0x1ff)).toEqual(Buffer.from([0x31, 0xff, 0x01]));
    expect(pack(0x1ffffff)).toEqual(Buffer.from([0x32, 0xff, 0xff, 0xff, 0x01]));
    // Use SizedInt for 64-bit values since JS can't precisely represent 0x1ffffffffffffff
    expect(pack(new SizedInt(0x1ffffffffffff, 8))).toEqual(
      Buffer.from([0x33, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00])
    );
  });

  it('should pack sized integers', () => {
    expect(pack(new SizedInt(0x1, 1))).toEqual(Buffer.from([0x30, 0x01]));
    expect(pack(new SizedInt(0x1, 2))).toEqual(Buffer.from([0x31, 0x01, 0x00]));
    expect(pack(new SizedInt(0x1, 4))).toEqual(Buffer.from([0x32, 0x01, 0x00, 0x00, 0x00]));
    expect(pack(new SizedInt(0x1, 8))).toEqual(
      Buffer.from([0x33, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    );
  });

  it('should pack float64', () => {
    // Note: 1.0 is treated as integer in JS, use 1.5 to test float packing
    expect(pack(1.5)).toEqual(Buffer.from([0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f]));
  });

  it('should pack short strings', () => {
    expect(pack('a')).toEqual(Buffer.from([0x41, 0x61]));
    expect(pack('abc')).toEqual(Buffer.from([0x43, 0x61, 0x62, 0x63]));
    expect(pack('a'.repeat(0x20))).toEqual(
      Buffer.concat([Buffer.from([0x60]), Buffer.alloc(0x20, 0x61)])
    );
  });

  it('should pack longer strings', () => {
    expect(pack('a'.repeat(33))).toEqual(
      Buffer.concat([Buffer.from([0x61, 0x21]), Buffer.alloc(33, 0x61)])
    );
    expect(pack('a'.repeat(256))).toEqual(
      Buffer.concat([Buffer.from([0x62, 0x00, 0x01]), Buffer.alloc(256, 0x61)])
    );
  });

  it('should pack short raw bytes', () => {
    expect(pack(Buffer.from([0xac]))).toEqual(Buffer.from([0x71, 0xac]));
    expect(pack(Buffer.from([0x12, 0x34, 0x56]))).toEqual(Buffer.from([0x73, 0x12, 0x34, 0x56]));
    expect(pack(Buffer.alloc(0x20, 0xad))).toEqual(
      Buffer.concat([Buffer.from([0x90]), Buffer.alloc(0x20, 0xad)])
    );
  });

  it('should pack longer raw bytes', () => {
    expect(pack(Buffer.alloc(33, 0x61))).toEqual(
      Buffer.concat([Buffer.from([0x91, 0x21]), Buffer.alloc(33, 0x61)])
    );
    expect(pack(Buffer.alloc(256, 0x61))).toEqual(
      Buffer.concat([Buffer.from([0x92, 0x00, 0x01]), Buffer.alloc(256, 0x61)])
    );
    expect(pack(Buffer.alloc(65536, 0x61))).toEqual(
      Buffer.concat([Buffer.from([0x93, 0x00, 0x00, 0x01, 0x00]), Buffer.alloc(65536, 0x61)])
    );
  });

  it('should pack array', () => {
    expect(pack([])).toEqual(Buffer.from([0xd0]));
    expect(pack([1, 'test', false])).toEqual(
      Buffer.from([0xd3, 0x09, 0x44, 0x74, 0x65, 0x73, 0x74, 0x02])
    );
    expect(pack([[true]])).toEqual(Buffer.from([0xd1, 0xd1, 0x01]));
  });

  it('should pack endless array', () => {
    const arr = Array(15).fill('a');
    const expected = Buffer.concat([
      Buffer.from([0xdf, 0x41, 0x61]),
      Buffer.alloc(14, 0xa0),
      Buffer.from([0x03]),
    ]);
    expect(pack(arr)).toEqual(expected);
  });

  it('should pack dict', () => {
    expect(pack({})).toEqual(Buffer.from([0xe0]));
    expect(pack({ a: 12 })).toEqual(Buffer.from([0xe1, 0x41, 0x61, 0x14]));
  });

  it('should pack with pointer references', () => {
    expect(pack(['a', 'a'])).toEqual(Buffer.from([0xd2, 0x41, 0x61, 0xa0]));
    expect(pack(['foo', 'bar', 'foo', 'bar'])).toEqual(
      Buffer.from([0xd4, 0x43, 0x66, 0x6f, 0x6f, 0x43, 0x62, 0x61, 0x72, 0xa0, 0xa1])
    );
  });
});

describe('OPACK unpack', () => {
  it('should throw on unsupported type', () => {
    expect(() => unpack(Buffer.from([0x00]))).toThrow(TypeError);
  });

  it('should unpack boolean', () => {
    expect(unpack(Buffer.from([0x01]))).toEqual([true, Buffer.alloc(0)]);
    expect(unpack(Buffer.from([0x02]))).toEqual([false, Buffer.alloc(0)]);
  });

  it('should unpack null', () => {
    expect(unpack(Buffer.from([0x04]))).toEqual([null, Buffer.alloc(0)]);
  });

  it('should unpack small integers', () => {
    expect(unpack(Buffer.from([0x08]))).toEqual([0, Buffer.alloc(0)]);
    expect(unpack(Buffer.from([0x17]))).toEqual([0xf, Buffer.alloc(0)]);
    expect(unpack(Buffer.from([0x2f]))).toEqual([0x27, Buffer.alloc(0)]);
  });

  it('should unpack larger integers', () => {
    const [val1] = unpack(Buffer.from([0x30, 0x28]));
    expect((val1 as SizedInt).valueOf()).toBe(0x28);

    const [val2] = unpack(Buffer.from([0x31, 0xff, 0x01]));
    expect((val2 as SizedInt).valueOf()).toBe(0x1ff);

    const [val3] = unpack(Buffer.from([0x32, 0xff, 0xff, 0xff, 0x01]));
    expect((val3 as SizedInt).valueOf()).toBe(0x1ffffff);

    const [val4] = unpack(Buffer.from([0x33, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]));
    expect((val4 as SizedInt).valueOf()).toBe(0x1ffffffffffffff);
  });

  it('should unpack sized integers with size attribute', () => {
    const [val1] = unpack(Buffer.from([0x30, 0x01]));
    expect(val1).toBeInstanceOf(SizedInt);
    expect((val1 as SizedInt).size).toBe(1);

    const [val2] = unpack(Buffer.from([0x31, 0x01, 0x00]));
    expect((val2 as SizedInt).size).toBe(2);

    const [val3] = unpack(Buffer.from([0x32, 0x01, 0x00, 0x00, 0x00]));
    expect((val3 as SizedInt).size).toBe(4);

    const [val4] = unpack(Buffer.from([0x33, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    expect((val4 as SizedInt).size).toBe(8);
  });

  it('should unpack float32', () => {
    const [val] = unpack(Buffer.from([0x35, 0x00, 0x00, 0x80, 0x3f]));
    expect(val).toBeCloseTo(1.0);
  });

  it('should unpack float64', () => {
    const [val] = unpack(Buffer.from([0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x3f]));
    expect(val).toBe(1.0);
  });

  it('should unpack short strings', () => {
    expect(unpack(Buffer.from([0x41, 0x61]))).toEqual(['a', Buffer.alloc(0)]);
    expect(unpack(Buffer.from([0x43, 0x61, 0x62, 0x63]))).toEqual(['abc', Buffer.alloc(0)]);
    expect(unpack(Buffer.concat([Buffer.from([0x60]), Buffer.alloc(0x20, 0x61)]))).toEqual([
      'a'.repeat(0x20),
      Buffer.alloc(0),
    ]);
  });

  it('should unpack longer strings', () => {
    expect(unpack(Buffer.concat([Buffer.from([0x61, 0x21]), Buffer.alloc(33, 0x61)]))).toEqual([
      'a'.repeat(33),
      Buffer.alloc(0),
    ]);
    expect(
      unpack(Buffer.concat([Buffer.from([0x62, 0x00, 0x01]), Buffer.alloc(256, 0x61)]))
    ).toEqual(['a'.repeat(256), Buffer.alloc(0)]);
  });

  it('should unpack short raw bytes', () => {
    const [val1, rem1] = unpack(Buffer.from([0x71, 0xac]));
    expect(Buffer.isBuffer(val1)).toBe(true);
    expect(val1).toEqual(Buffer.from([0xac]));
    expect(rem1).toEqual(Buffer.alloc(0));

    const [val2] = unpack(Buffer.from([0x73, 0x12, 0x34, 0x56]));
    expect(val2).toEqual(Buffer.from([0x12, 0x34, 0x56]));
  });

  it('should unpack array', () => {
    expect(unpack(Buffer.from([0xd0]))).toEqual([[], Buffer.alloc(0)]);
    expect(unpack(Buffer.from([0xd3, 0x09, 0x44, 0x74, 0x65, 0x73, 0x74, 0x02]))).toEqual([
      [1, 'test', false],
      Buffer.alloc(0),
    ]);
    expect(unpack(Buffer.from([0xd1, 0xd1, 0x01]))).toEqual([[[true]], Buffer.alloc(0)]);
  });

  it('should unpack endless array', () => {
    const data = Buffer.concat([
      Buffer.from([0xdf, 0x41, 0x61]),
      Buffer.alloc(15, 0xa0),
      Buffer.from([0x03]),
    ]);
    const [val] = unpack(data);
    expect(val).toEqual(Array(16).fill('a'));
  });

  it('should unpack dict', () => {
    expect(unpack(Buffer.from([0xe0]))).toEqual([{}, Buffer.alloc(0)]);
    expect(unpack(Buffer.from([0xe1, 0x41, 0x61, 0x14]))).toEqual([{ a: 12 }, Buffer.alloc(0)]);
  });

  it('should unpack pointer references', () => {
    expect(unpack(Buffer.from([0xd2, 0x41, 0x61, 0xa0]))).toEqual([['a', 'a'], Buffer.alloc(0)]);
    expect(
      unpack(Buffer.from([0xd4, 0x43, 0x66, 0x6f, 0x6f, 0x43, 0x62, 0x61, 0x72, 0xa0, 0xa1]))
    ).toEqual([['foo', 'bar', 'foo', 'bar'], Buffer.alloc(0)]);
  });

  it('should unpack uid references', () => {
    expect(unpack(Buffer.from([0xdf, 0x30, 0x01, 0x30, 0x02, 0xc1, 0x01, 0x03]))).toEqual([
      [expect.any(SizedInt), expect.any(SizedInt), expect.any(SizedInt)],
      Buffer.alloc(0),
    ]);
  });
});

describe('OPACK roundtrip', () => {
  it('should roundtrip complex data', () => {
    // Use SizedInt for values that will be encoded with explicit size
    const data = {
      _i: '_systemInfo',
      _x: new SizedInt(1254122577, 4),
      _btHP: false,
      _c: {
        _pubID: 'AA:BB:CC:DD:EE:FF',
        _sv: '230.1',
        _bf: 0,
        _stA: [
          'com.apple.LiveAudio',
          'com.apple.siri.wakeup',
          'com.apple.Seymour',
          'com.apple.announce',
        ],
        _i: '6c62fca18b11',
        _clFl: new SizedInt(128, 1),
        _dC: '1',
        _sf: new SizedInt(256, 2),
        model: 'iPhone10,6',
        name: 'iPhone',
      },
      _t: 2,
    };

    const packed = pack(data);
    const [unpacked] = unpack(packed);

    // Compare using valueOf() for SizedInt values
    const normalize = (obj: unknown): unknown => {
      if (obj instanceof SizedInt) return obj.valueOf();
      if (Array.isArray(obj)) return obj.map(normalize);
      if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          result[k] = normalize(v);
        }
        return result;
      }
      return obj;
    };

    expect(normalize(unpacked)).toEqual(normalize(data));
  });
});

// Additional tests ported from pyatv test_opack.py

describe('OPACK pack (additional)', () => {
  it('should pack UUID', () => {
    const uuid = createUUID('12345678-1234-5678-1234-567812345678');
    expect(pack(uuid)).toEqual(
      Buffer.from([0x05, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78])
    );
  });

  it('should throw on datetime objects', () => {
    expect(() => pack(new Date())).toThrow(TypeError);
    expect(() => pack(new Date())).toThrow('Packing datetime objects is not supported');
  });

  it('should pack endless dict', () => {
    // Create dict with 15 key-value pairs (triggers endless dict encoding)
    const dict: Record<string, string> = {};
    for (let x = 97; x < 127; x += 2) {
      dict[String.fromCharCode(x)] = String.fromCharCode(x + 1);
    }
    const packed = pack(dict);
    // Should start with 0xef (endless dict) and end with 0x03 (terminator)
    expect(packed[0]).toBe(0xef);
    expect(packed[packed.length - 1]).toBe(0x03);
  });

  it('should pack nested dict with pointer references', () => {
    expect(pack({ a: 'b', c: { d: 'a' }, d: true })).toEqual(
      Buffer.from([0xe3, 0x41, 0x61, 0x41, 0x62, 0x41, 0x63, 0xe1, 0x41, 0x64, 0xa0, 0xa3, 0x01])
    );
  });
});

describe('OPACK unpack (additional)', () => {
  it('should unpack UUID', () => {
    const [val] = unpack(
      Buffer.from([0x05, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78])
    );
    expect(val).toBe('12345678123456781234567812345678');
  });

  it('should unpack absolute time as integer', () => {
    const [val] = unpack(Buffer.from([0x06, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    expect(val).toBe(1);
  });

  it('should unpack endless dict', () => {
    // Build expected dict
    const expected: Record<string, string> = {};
    for (let x = 97; x < 127; x += 2) {
      expected[String.fromCharCode(x)] = String.fromCharCode(x + 1);
    }

    // Build packed data: 0xef + pairs of (0x41 + char) + 0x03
    const parts: Buffer[] = [Buffer.from([0xef])];
    for (let x = 97; x < 127; x++) {
      parts.push(Buffer.from([0x41, x]));
    }
    parts.push(Buffer.from([0x03]));
    const packed = Buffer.concat(parts);

    const [val] = unpack(packed);
    expect(val).toEqual(expected);
  });

  it('should unpack nested dict with pointer references', () => {
    const [val] = unpack(
      Buffer.from([0xe3, 0x41, 0x61, 0x41, 0x62, 0x41, 0x63, 0xe1, 0x41, 0x64, 0xa0, 0xa3, 0x01])
    );
    expect(val).toEqual({ a: 'b', c: { d: 'a' }, d: true });
  });

  it('should unpack uid references with different sizes', () => {
    // c1 = 1-byte uid reference
    const [val1] = unpack(Buffer.from([0xdf, 0x30, 0x01, 0x30, 0x02, 0xc1, 0x01, 0x03]));
    expect(Array.isArray(val1)).toBe(true);
    expect((val1 as unknown[]).length).toBe(3);

    // c2 = 2-byte uid reference
    const [val2] = unpack(Buffer.from([0xdf, 0x30, 0x01, 0x30, 0x02, 0xc2, 0x01, 0x00, 0x03]));
    expect(Array.isArray(val2)).toBe(true);
    expect((val2 as unknown[]).length).toBe(3);

    // c3 = 3-byte uid reference
    const [val3] = unpack(Buffer.from([0xdf, 0x30, 0x01, 0x30, 0x02, 0xc3, 0x01, 0x00, 0x00, 0x03]));
    expect(Array.isArray(val3)).toBe(true);
    expect((val3 as unknown[]).length).toBe(3);

    // c4 = 4-byte uid reference
    const [val4] = unpack(Buffer.from([0xdf, 0x30, 0x01, 0x30, 0x02, 0xc4, 0x01, 0x00, 0x00, 0x00, 0x03]));
    expect(Array.isArray(val4)).toBe(true);
    expect((val4 as unknown[]).length).toBe(3);
  });

  it('should unpack nested endless arrays', () => {
    const list1 = Buffer.concat([
      Buffer.from([0xdf, 0x41, 0x61]),
      Buffer.alloc(15, 0xa0),
      Buffer.from([0x03]),
    ]);
    const list2 = Buffer.concat([
      Buffer.from([0xdf, 0x41, 0x62]),
      Buffer.alloc(15, 0xa1),
      Buffer.from([0x03]),
    ]);
    const nested = Buffer.concat([Buffer.from([0xd2]), list1, list2]);

    const [val] = unpack(nested);
    expect(val).toEqual([Array(16).fill('a'), Array(16).fill('b')]);
  });
});
