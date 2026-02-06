#!/usr/bin/env npx tsx
/**
 * Pair with an Apple TV device
 *
 * Usage: npx tsx verify/pair-device.ts --host=<IP> [--port=49152] [--name=<DeviceName>]
 *
 * This will start the pairing process. You'll need to enter the PIN
 * displayed on your Apple TV screen.
 */

import * as readline from 'readline';
import {
  CompanionConnection,
  CompanionProtocol,
  CompanionPairSetupProcedure,
  SRPAuthHandler,
} from '../src/index.js';

function parseArgs(): { host: string; port: number; name: string } {
  const args = process.argv.slice(2);

  const hostArg = args.find((a) => a.startsWith('--host='));
  const portArg = args.find((a) => a.startsWith('--port='));
  const nameArg = args.find((a) => a.startsWith('--name='));

  if (!hostArg) {
    console.error('Usage: npx tsx verify/pair-device.ts --host=<IP> [--port=49152] [--name=<DeviceName>]');
    console.error('\nFirst run scan-devices.ts to find available devices.');
    process.exit(1);
  }

  return {
    host: hostArg.split('=')[1],
    port: portArg ? parseInt(portArg.split('=')[1], 10) : 49152,
    name: nameArg ? nameArg.split('=')[1] : 'atv-companion',
  };
}

function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const { host, port, name } = parseArgs();

  console.log(`Connecting to Apple TV at ${host}:${port}...`);
  console.log(`Device name: ${name}`);

  const connection = new CompanionConnection(host, port);
  const protocol = new CompanionProtocol(connection);

  try {
    await connection.connect();
    console.log('Connected!\n');

    const srp = new SRPAuthHandler();
    const pairSetup = new CompanionPairSetupProcedure(protocol, srp);

    console.log('Starting pairing process...');
    console.log('A PIN code should appear on your Apple TV screen.\n');

    await pairSetup.startPairing();

    const pin = await askQuestion('Enter the 4-digit PIN from your Apple TV: ');

    if (!/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }

    console.log('\nVerifying PIN...');
    const credentials = await pairSetup.finishPairing(pin, name);

    console.log('\n' + '='.repeat(60));
    console.log('Pairing successful!');
    console.log('='.repeat(60));

    // Save credentials to file
    const credentialsJson = JSON.stringify(credentials, (key, value) => {
      if (Buffer.isBuffer(value)) {
        return value.toString('hex');
      }
      return value;
    }, 2);

    const credentialsBase64 = Buffer.from(credentialsJson).toString('base64');

    console.log('\nCredentials (JSON):');
    console.log(credentialsJson);

    console.log('\nCredentials (Base64 - for environment variable):');
    console.log(credentialsBase64);

    console.log('\nTo use these credentials, set the environment variable:');
    console.log(`  export ATV_CREDENTIALS="${credentialsBase64}"`);

    console.log('\nThen run other verify scripts like:');
    console.log('  npx tsx verify/wake-device.ts --host=' + host);
    console.log('  npx tsx verify/send-deeplink.ts --host=' + host + ' --url=<URL>');

  } catch (error) {
    console.error('\nPairing failed:', (error as Error).message);
    process.exit(1);
  } finally {
    connection.close();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
