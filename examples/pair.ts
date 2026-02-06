/**
 * Example: Pair with an Apple TV
 *
 * Usage: pnpm run example:pair
 *
 * Environment variables:
 *   ATV_HOST - Apple TV IP address (required)
 *   ATV_PORT - Companion port (default: 49152)
 *   ATV_PIN  - PIN code shown on Apple TV screen (required)
 */

import {
  CompanionConnection,
  CompanionProtocol,
  CompanionPairSetupProcedure,
} from '../src/index.js';

async function main() {
  const host = process.env.ATV_HOST;
  const port = parseInt(process.env.ATV_PORT || '49152', 10);
  const pin = process.env.ATV_PIN;

  if (!host) {
    console.error('Error: ATV_HOST environment variable is required');
    console.error('Usage: ATV_HOST=192.168.1.100 ATV_PIN=1234 pnpm run example:pair');
    process.exit(1);
  }

  if (!pin) {
    console.error('Error: ATV_PIN environment variable is required');
    console.error('Usage: ATV_HOST=192.168.1.100 ATV_PIN=1234 pnpm run example:pair');
    process.exit(1);
  }

  console.log(`Connecting to Apple TV at ${host}:${port}...`);

  const connection = new CompanionConnection(host, port);
  const protocol = new CompanionProtocol(connection);

  try {
    await connection.connect();
    console.log('Connected!\n');

    console.log('Starting pairing...');
    const pairSetup = new CompanionPairSetupProcedure(protocol);

    await pairSetup.startPairing();
    console.log('Pairing started. Enter PIN from Apple TV screen...\n');

    const credentials = await pairSetup.finishPairing(pin);

    console.log('Pairing successful!\n');
    console.log('Credentials (save these for future connections):');
    console.log(JSON.stringify(credentials, null, 2));

    // Base64 encode for easy storage
    const credentialsBase64 = Buffer.from(JSON.stringify(credentials)).toString('base64');
    console.log('\nBase64 encoded credentials:');
    console.log(credentialsBase64);
  } catch (error) {
    console.error('Pairing failed:', error);
    process.exit(1);
  } finally {
    connection.close();
  }
}

main().catch(console.error);
