#!/usr/bin/env npx tsx
/**
 * Launch an app on Apple TV by bundle ID
 *
 * Usage: npx tsx verify/launch-app.ts --host=<IP> --app=<BUNDLE_ID> [--port=49152]
 *
 * Common bundle IDs:
 *   com.apple.TVSettings     - Settings
 *   com.apple.TVAppStore     - App Store
 *   com.apple.TVMusic        - Apple Music
 *   com.apple.TVPhotos       - Photos
 *   com.netflix.Netflix      - Netflix
 *   com.google.ios.youtube   - YouTube
 *   com.disney.disneyplus    - Disney+
 *   com.amazon.aiv.AIVApp    - Prime Video
 *   com.hbo.hbonow           - HBO Max
 *
 * Environment variables:
 *   ATV_CREDENTIALS - Base64 encoded credentials from pairing
 */

import { CompanionAPI, type HapCredentials } from '../src/index.js';

const COMMON_APPS: Record<string, string> = {
  settings: 'com.apple.TVSettings',
  appstore: 'com.apple.TVAppStore',
  music: 'com.apple.TVMusic',
  photos: 'com.apple.TVPhotos',
  netflix: 'com.netflix.Netflix',
  youtube: 'com.google.ios.youtube',
  disney: 'com.disney.disneyplus',
  prime: 'com.amazon.aiv.AIVApp',
  hbo: 'com.hbo.hbonow',
  tv: 'com.apple.TVWatchList',
  fitness: 'com.apple.TVFitness',
};

function parseArgs(): { host: string; port: number; app: string } {
  const args = process.argv.slice(2);

  const hostArg = args.find((a) => a.startsWith('--host='));
  const portArg = args.find((a) => a.startsWith('--port='));
  const appArg = args.find((a) => a.startsWith('--app='));

  if (args.includes('--list')) {
    console.log('Common app shortcuts:');
    for (const [shortcut, bundleId] of Object.entries(COMMON_APPS)) {
      console.log(`  ${shortcut.padEnd(12)} -> ${bundleId}`);
    }
    process.exit(0);
  }

  if (!hostArg || !appArg) {
    console.error('Usage: npx tsx verify/launch-app.ts --host=<IP> --app=<BUNDLE_ID> [--port=49152]');
    console.error('\nUse --list to see common app shortcuts');
    console.error('\nExamples:');
    console.error('  npx tsx verify/launch-app.ts --host=192.168.1.100 --app=netflix');
    console.error('  npx tsx verify/launch-app.ts --host=192.168.1.100 --app=com.netflix.Netflix');
    console.error('\nEnvironment variables:');
    console.error('  ATV_CREDENTIALS - Base64 encoded credentials from pairing');
    process.exit(1);
  }

  let app = appArg.split('=')[1];

  // Check if it's a shortcut
  if (COMMON_APPS[app.toLowerCase()]) {
    app = COMMON_APPS[app.toLowerCase()];
  }

  return {
    host: hostArg.split('=')[1],
    port: portArg ? parseInt(portArg.split('=')[1], 10) : 49152,
    app,
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

    // Handle both formats:
    // 1. {type: "Buffer", data: [...]} - Node.js JSON.stringify format
    // 2. hex string or base64 string
    const toBuffer = (value: unknown): Buffer => {
      if (typeof value === 'object' && value !== null && 'type' in value && 'data' in value) {
        const obj = value as { type: string; data: number[] };
        if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
          return Buffer.from(obj.data);
        }
      }
      if (typeof value === 'string') {
        // Try base64 first, then hex
        const base64Buf = Buffer.from(value, 'base64');
        if (base64Buf.length > 0) {
          return base64Buf;
        }
        return Buffer.from(value, 'hex');
      }
      throw new Error('Invalid buffer format');
    };

    return {
      ltpk: toBuffer(parsed.ltpk),
      ltsk: toBuffer(parsed.ltsk),
      atvId: toBuffer(parsed.atvId),
      clientId: toBuffer(parsed.clientId),
    };
  } catch {
    console.error('Error: Invalid credentials format');
    process.exit(1);
  }
}

async function main() {
  const { host, port, app } = parseArgs();
  const credentials = loadCredentials();

  console.log(`Connecting to Apple TV at ${host}:${port}...`);

  const api = new CompanionAPI(host, port, credentials);

  try {
    await api.connect();
    console.log('Connected!\n');

    console.log(`Launching app: ${app}`);
    await api.launchApp(app);

    console.log('\nApp launch command sent successfully!');

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
