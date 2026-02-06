/**
 * Example: Remote control an Apple TV
 *
 * Usage: pnpm run example:remote
 *
 * Environment variables:
 *   ATV_HOST        - Apple TV IP address (required)
 *   ATV_PORT        - Companion port (default: 49152)
 *   ATV_CREDENTIALS - Base64 encoded credentials from pairing (required)
 */

import {
  CompanionAPI,
  HidCommand,
  type HapCredentials,
} from '../src/index.js';

async function main() {
  const host = process.env.ATV_HOST;
  const port = parseInt(process.env.ATV_PORT || '49152', 10);
  const credentialsBase64 = process.env.ATV_CREDENTIALS;

  if (!host) {
    console.error('Error: ATV_HOST environment variable is required');
    process.exit(1);
  }

  if (!credentialsBase64) {
    console.error('Error: ATV_CREDENTIALS environment variable is required');
    console.error('Run example:pair first to get credentials');
    process.exit(1);
  }

  // Decode credentials
  let credentials: HapCredentials;
  try {
    credentials = JSON.parse(
      Buffer.from(credentialsBase64, 'base64').toString('utf-8')
    );
  } catch {
    console.error('Error: Invalid credentials format');
    process.exit(1);
  }

  console.log(`Connecting to Apple TV at ${host}:${port}...`);

  const api = new CompanionAPI(host, port, credentials);

  try {
    await api.connect();
    console.log('Connected!\n');

    // Demo: Send some remote control commands
    console.log('Sending Menu button...');
    await api.pressButton(HidCommand.Menu);

    await sleep(500);

    console.log('Sending Up button...');
    await api.pressButton(HidCommand.Up);

    await sleep(500);

    console.log('Sending Down button...');
    await api.pressButton(HidCommand.Down);

    await sleep(500);

    console.log('Sending Select button...');
    await api.pressButton(HidCommand.Select);

    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await api.disconnect();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
