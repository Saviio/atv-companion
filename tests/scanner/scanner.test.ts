/**
 * Scanner module tests
 */

import { describe, it, expect } from 'vitest';
import {
  AppleTVScanner,
  supportsPairing,
  isPairingDisabled,
  type AppleTVDevice,
} from '../../src/scanner/scanner.js';

describe('AppleTVScanner', () => {
  it('should create scanner instance', () => {
    const scanner = new AppleTVScanner();
    expect(scanner).toBeInstanceOf(AppleTVScanner);
    scanner.destroy();
  });

  it('should return empty array when no devices found', () => {
    const scanner = new AppleTVScanner();
    expect(scanner.getDevices()).toEqual([]);
    scanner.destroy();
  });

  it('should emit events', () => {
    const scanner = new AppleTVScanner();
    expect(scanner.on).toBeDefined();
    expect(scanner.emit).toBeDefined();
    scanner.destroy();
  });
});

describe('supportsPairing', () => {
  it('should return true when PIN pairing is supported', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {
        rpfl: '0x4000', // PAIRING_WITH_PIN_SUPPORTED_MASK
      },
    };
    expect(supportsPairing(device)).toBe(true);
  });

  it('should return false when pairing is disabled', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {
        rpfl: '0x4004', // PAIRING_DISABLED_MASK | PAIRING_WITH_PIN_SUPPORTED_MASK
      },
    };
    expect(supportsPairing(device)).toBe(false);
  });

  it('should return false when PIN pairing is not supported', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {
        rpfl: '0x100', // Some other flag
      },
    };
    expect(supportsPairing(device)).toBe(false);
  });

  it('should handle missing rpfl property', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {},
    };
    expect(supportsPairing(device)).toBe(false);
  });
});

describe('isPairingDisabled', () => {
  it('should return true when pairing is disabled', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {
        rpfl: '0x04', // PAIRING_DISABLED_MASK
      },
    };
    expect(isPairingDisabled(device)).toBe(true);
  });

  it('should return false when pairing is enabled', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {
        rpfl: '0x4000', // PAIRING_WITH_PIN_SUPPORTED_MASK
      },
    };
    expect(isPairingDisabled(device)).toBe(false);
  });

  it('should handle missing rpfl property', () => {
    const device: AppleTVDevice = {
      name: 'Test TV',
      host: '192.168.1.100',
      port: 49152,
      properties: {},
    };
    expect(isPairingDisabled(device)).toBe(false);
  });
});
