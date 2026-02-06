#!/usr/bin/env npx tsx
/**
 * Send a deeplink URL to Apple TV (launch app or open content)
 *
 * Usage: npx tsx verify/send-deeplink.ts --host=<IP> --url=<URL> [--port=49152]
 *
 * Examples:
 *   # Open Netflix
 *   npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url=netflix://
 *
 *   # Open YouTube video
 *   npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url="youtube://watch?v=dQw4w9WgXcQ"
 *
 *   # Open Disney+
 *   npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url=disneyplus://
 *
 *   # Open Apple TV+ show
 *   npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url="https://tv.apple.com/show/..."
 *
 * Environment variables:
 *   ATV_CREDENTIALS - Base64 encoded credentials from pairing
 */

import { CompanionAPI, type HapCredentials } from '../src/index.js';

function parseArgs(): { host: string; port: number; url: string } {
  const args = process.argv.slice(2);

  const hostArg = args.find((a) => a.startsWith('--host='));
  const portArg = args.find((a) => a.startsWith('--port='));
  const urlArg = args.find((a) => a.startsWith('--url='));

  if (!hostArg || !urlArg) {
    console.error('Usage: npx tsx verify/send-deeplink.ts --host=<IP> --url=<URL> [--port=49152]');
    console.error('\nExamples:');
    console.error('  npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url=netflix://');
    console.error('  npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url="youtube://watch?v=VIDEO_ID"');
    console.error('  npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url=disneyplus://');
    console.error('\nEnvironment variables:');
    console.error('  ATV_CREDENTIALS - Base64 encoded credentials from pairing');
    process.exit(1);
  }

  return {
    host: hostArg.split('=')[1],
    port: portArg ? parseInt(portArg.split('=')[1], 10) : 49152,
    url: urlArg.split('=').slice(1).join('='), // Handle URLs with = in them
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
  const { host, port, url } = parseArgs();
  const credentials = loadCredentials();

  console.log(`Connecting to Apple TV at ${host}:${port}...`);

  const api = new CompanionAPI(host, port, credentials);

  try {
    await api.connect();
    console.log('Connected!\n');

    console.log(`Sending deeplink: ${url}`);
    await api.launchApp(url);

    console.log('\nDeeplink sent successfully!');
    console.log('The app should be opening on your Apple TV.');

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
