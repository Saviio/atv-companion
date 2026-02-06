#!/usr/bin/env npx tsx
/**
 * Scan for Apple TV devices on the local network
 *
 * Usage: npx tsx verify/scan-devices.ts [--timeout=5000]
 */

import { scan, supportsPairing, isPairingDisabled } from '../src/index.js';

async function main() {
  const args = process.argv.slice(2);
  const timeoutArg = args.find((a) => a.startsWith('--timeout='));
  const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 5000;

  console.log(`Scanning for Apple TV devices (timeout: ${timeout}ms)...\n`);

  const devices = await scan({ timeout });

  if (devices.length === 0) {
    console.log('No Apple TV devices found on the network.');
    console.log('\nTroubleshooting:');
    console.log('  - Make sure your Apple TV is powered on');
    console.log('  - Ensure you are on the same network as the Apple TV');
    console.log('  - Try increasing the timeout: --timeout=10000');
    return;
  }

  console.log(`Found ${devices.length} Apple TV device(s):\n`);
  console.log('='.repeat(60));

  for (const device of devices) {
    console.log(`\nDevice: ${device.name}`);
    console.log('-'.repeat(40));
    console.log(`  Host:       ${device.host}`);
    console.log(`  Port:       ${device.port}`);

    if (device.model) {
      console.log(`  Model:      ${device.model}`);
    }

    if (device.identifier) {
      console.log(`  Identifier: ${device.identifier}`);
    }

    // Pairing status
    if (isPairingDisabled(device)) {
      console.log(`  Pairing:    Disabled`);
    } else if (supportsPairing(device)) {
      console.log(`  Pairing:    Supported (PIN required)`);
    } else {
      console.log(`  Pairing:    Not supported`);
    }

    // Show raw properties if verbose
    if (args.includes('--verbose') || args.includes('-v')) {
      console.log(`  Properties:`);
      for (const [key, value] of Object.entries(device.properties)) {
        console.log(`    ${key}: ${value}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nTo pair with a device, use:');
  console.log('  npx tsx verify/pair-device.ts --host=<IP> --port=<PORT>');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
