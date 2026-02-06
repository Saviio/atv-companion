/**
 * Example: Scan for Apple TV devices on the local network
 *
 * Usage: pnpm run example:scan
 */

import { scan, supportsPairing, isPairingDisabled } from '../src/index.js';

async function main() {
  console.log('Scanning for Apple TV devices...\n');

  const devices = await scan({ timeout: 5000 });

  if (devices.length === 0) {
    console.log('No Apple TV devices found.');
    return;
  }

  console.log(`Found ${devices.length} device(s):\n`);

  for (const device of devices) {
    console.log(`Name: ${device.name}`);
    console.log(`  Host: ${device.host}`);
    console.log(`  Port: ${device.port}`);
    if (device.model) {
      console.log(`  Model: ${device.model}`);
    }
    if (device.identifier) {
      console.log(`  ID: ${device.identifier}`);
    }

    const pairingStatus = isPairingDisabled(device)
      ? 'Disabled'
      : supportsPairing(device)
        ? 'Supported (PIN)'
        : 'Not supported';
    console.log(`  Pairing: ${pairingStatus}`);
    console.log();
  }
}

main().catch(console.error);
