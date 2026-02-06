/**
 * mDNS Scanner for Apple TV Companion Protocol
 *
 * Discovers Apple TV devices on the local network using mDNS/Bonjour.
 * Service type: _companion-link._tcp.local
 */

import { Bonjour, type Service, type Browser } from 'bonjour-service';
import { EventEmitter } from 'events';

/**
 * Discovered Apple TV device
 */
export interface AppleTVDevice {
  /** Device name (e.g., "Living Room") */
  name: string;
  /** IP address */
  host: string;
  /** Companion protocol port */
  port: number;
  /** Device model identifier (e.g., "AppleTV6,2") */
  model?: string;
  /** Unique device identifier */
  identifier?: string;
  /** Raw mDNS TXT record properties */
  properties: Record<string, string>;
}

/**
 * Scanner options
 */
export interface ScannerOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
}

/** Companion protocol service type */
const COMPANION_SERVICE_TYPE = 'companion-link';

/** Pairing flags from rpfl property */
const PAIRING_DISABLED_MASK = 0x02;
const PAIRING_WITH_PIN_SUPPORTED_MASK = 0x200;

/**
 * Parse device model from rpmd property
 */
function parseModel(rpmd: string | undefined): string | undefined {
  return rpmd;
}

/**
 * Parse unique identifier from properties
 * Uses rpHA (HomeKit Accessory ID) or falls back to service name
 */
function parseIdentifier(
  serviceName: string,
  properties: Record<string, string>
): string {
  // rpHA is the HomeKit Accessory ID
  if (properties.rpHA) {
    return properties.rpHA;
  }
  // Fall back to service name
  return serviceName;
}

/**
 * Convert mDNS service to AppleTVDevice
 */
function serviceToDevice(service: Service): AppleTVDevice | null {
  // Get first IPv4 address
  const addresses = service.addresses || [];
  const ipv4 = addresses.find(
    (addr) => addr.includes('.') && !addr.startsWith('169.254')
  );

  if (!ipv4) {
    return null;
  }

  // Parse TXT record properties
  const properties: Record<string, string> = {};
  if (service.txt) {
    for (const [key, value] of Object.entries(service.txt)) {
      properties[key] = String(value);
    }
  }

  return {
    name: service.name,
    host: ipv4,
    port: service.port,
    model: parseModel(properties.rpmd),
    identifier: parseIdentifier(service.name, properties),
    properties,
  };
}

/**
 * Scanner for discovering Apple TV devices on the local network
 */
export class AppleTVScanner extends EventEmitter {
  private bonjour: Bonjour;
  private browser: Browser | null = null;
  private devices: Map<string, AppleTVDevice> = new Map();

  constructor() {
    super();
    this.bonjour = new Bonjour();
  }

  /**
   * Start scanning for Apple TV devices
   */
  start(): void {
    if (this.browser) {
      return;
    }

    this.devices.clear();
    this.browser = this.bonjour.find({ type: COMPANION_SERVICE_TYPE });

    this.browser!.on('up', (service: Service) => {
      const device = serviceToDevice(service);
      if (device) {
        this.devices.set(device.identifier!, device);
        this.emit('device', device);
      }
    });

    this.browser!.on('down', (service: Service) => {
      const device = serviceToDevice(service);
      if (device) {
        this.devices.delete(device.identifier!);
        this.emit('deviceRemoved', device);
      }
    });
  }

  /**
   * Stop scanning
   */
  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
  }

  /**
   * Get all discovered devices
   */
  getDevices(): AppleTVDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Destroy the scanner and release resources
   */
  destroy(): void {
    this.stop();
    this.bonjour.destroy();
  }
}

/**
 * Scan for Apple TV devices on the local network
 *
 * @param options - Scanner options
 * @returns Promise resolving to array of discovered devices
 *
 * @example
 * ```typescript
 * const devices = await scan({ timeout: 5000 });
 * console.log(devices);
 * // [{ name: 'Living Room', host: '192.168.1.100', port: 49152, ... }]
 * ```
 */
export async function scan(options: ScannerOptions = {}): Promise<AppleTVDevice[]> {
  const { timeout = 5000 } = options;

  return new Promise((resolve) => {
    const scanner = new AppleTVScanner();
    const devices: AppleTVDevice[] = [];

    scanner.on('device', (device: AppleTVDevice) => {
      // Avoid duplicates
      if (!devices.some((d) => d.identifier === device.identifier)) {
        devices.push(device);
      }
    });

    scanner.start();

    setTimeout(() => {
      scanner.destroy();
      resolve(devices);
    }, timeout);
  });
}

/**
 * Check if a device supports pairing with PIN
 */
export function supportsPairing(device: AppleTVDevice): boolean {
  const flagsStr = device.properties.rpFl || device.properties.rpfl || '0x0';
  const flags = parseInt(flagsStr, 16);
  if (flags & PAIRING_DISABLED_MASK) {
    return false;
  }
  return (flags & PAIRING_WITH_PIN_SUPPORTED_MASK) !== 0;
}

/**
 * Check if pairing is disabled for a device
 */
export function isPairingDisabled(device: AppleTVDevice): boolean {
  const flagsStr = device.properties.rpFl || device.properties.rpfl || '0x0';
  const flags = parseInt(flagsStr, 16);
  return (flags & PAIRING_DISABLED_MASK) !== 0;
}
