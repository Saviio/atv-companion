#!/usr/bin/env npx tsx
/**
 * Put Apple TV to sleep (turn off)
 *
 * Usage: npx tsx verify/sleep-device.ts --host=<IP> [--port=49152]
 *
 * Environment variables:
 *   ATV_CREDENTIALS - Base64 encoded credentials from pairing
 */

import { CompanionAPI, HidCommand, type HapCredentials } from '../src/index.js';

function parseArgs(): { host: string; port: number } {
  const args = process.argv.slice(2);

  const hostArg = args.find((a) => a.startsWith('--host='));
  const portArg = args.find((a) => a.startsWith('--port='));

  if (!hostArg) {
    console.error('Usage: npx tsx verify/sleep-device.ts --host=<IP> [--port=49152]');
    console.error('\nEnvironment variables:');
    console.error('  ATV_CREDENTIALS - Base64 encoded credentials from pairing');
    process.exit(1);
  }

  return {
    host: hostArg.split('=')[1],
    port: portArg ? parseInt(portArg.split('=')[1], 10) : 49152,
  };
}

function loadCredentials(): HapCredentials {
  const credentialsBase64 = process.env.ATV_CREDENTIALS;

  if (!credentialsBase64) {
    console.error('Error: ATV_CREDENTIALS environment variable is required');
    console.error('\nRun pair-device.ts first to get credentials.');
    process.exit(1);
  }

  try {
    const json = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);

    return {
      ltpk: Buffer.from(parsed.ltpk, 'hex'),
      ltsk: Buffer.from(parsed.ltsk, 'hex'),
      atvId: Buffer.from(parsed.atvId, 'hex'),
      clientId: Buffer.from(parsed.clientId, 'hex'),
    };
  } catch {
    console.error('Error: Invalid credentials format');
    process.exit(1);
  }
}

async function main() {
  const { host, port } = parseArgs();
  const credentials = loadCredentials();

  console.log(`Connecting to Apple TV at ${host}:${port}...`);

  const api = new CompanionAPI(host, port, credentials);

  try {
    await api.connect();
    console.log('Connected!\n');

    console.log('Sending Sleep command...');
    await api.pressButton(HidCommand.Sleep);

    console.log('Sleep command sent successfully!');
    console.log('\nYour Apple TV should now be going to sleep.');

  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  } finally {
    await api.disconnect();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
