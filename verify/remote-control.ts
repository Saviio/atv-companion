#!/usr/bin/env npx tsx
/**
 * Send remote control commands to Apple TV
 *
 * Usage: npx tsx verify/remote-control.ts --host=<IP> --cmd=<COMMAND> [--port=49152]
 *
 * Available commands:
 *   up, down, left, right  - Navigation
 *   select, menu, home     - Actions
 *   play, pause, playpause - Playback
 *   volumeup, volumedown   - Volume
 *   siri                   - Activate Siri
 *   screensaver            - Start screensaver
 *
 * Environment variables:
 *   ATV_CREDENTIALS - Base64 encoded credentials from pairing
 */

import { CompanionAPI, HidCommand, type HapCredentials } from '../src/index.js';

const COMMANDS: Record<string, HidCommand> = {
  up: HidCommand.Up,
  down: HidCommand.Down,
  left: HidCommand.Left,
  right: HidCommand.Right,
  menu: HidCommand.Menu,
  select: HidCommand.Select,
  home: HidCommand.Home,
  volumeup: HidCommand.VolumeUp,
  volumedown: HidCommand.VolumeDown,
  siri: HidCommand.Siri,
  screensaver: HidCommand.Screensaver,
  sleep: HidCommand.Sleep,
  wake: HidCommand.Wake,
  playpause: HidCommand.PlayPause,
  channelup: HidCommand.ChannelIncrement,
  channeldown: HidCommand.ChannelDecrement,
  guide: HidCommand.Guide,
  pageup: HidCommand.PageUp,
  pagedown: HidCommand.PageDown,
};

function parseArgs(): { host: string; port: number; cmd: string } {
  const args = process.argv.slice(2);

  const hostArg = args.find((a) => a.startsWith('--host='));
  const portArg = args.find((a) => a.startsWith('--port='));
  const cmdArg = args.find((a) => a.startsWith('--cmd='));

  if (args.includes('--list')) {
    console.log('Available commands:');
    for (const cmd of Object.keys(COMMANDS)) {
      console.log(`  ${cmd}`);
    }
    process.exit(0);
  }

  if (!hostArg || !cmdArg) {
    console.error('Usage: npx tsx verify/remote-control.ts --host=<IP> --cmd=<COMMAND> [--port=49152]');
    console.error('\nUse --list to see available commands');
    console.error('\nExamples:');
    console.error('  npx tsx verify/remote-control.ts --host=192.168.1.100 --cmd=menu');
    console.error('  npx tsx verify/remote-control.ts --host=192.168.1.100 --cmd=select');
    console.error('\nEnvironment variables:');
    console.error('  ATV_CREDENTIALS - Base64 encoded credentials from pairing');
    process.exit(1);
  }

  return {
    host: hostArg.split('=')[1],
    port: portArg ? parseInt(portArg.split('=')[1], 10) : 49152,
    cmd: cmdArg.split('=')[1].toLowerCase(),
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
  const { host, port, cmd } = parseArgs();
  const credentials = loadCredentials();

  const hidCommand = COMMANDS[cmd];
  if (hidCommand === undefined) {
    console.error(`Unknown command: ${cmd}`);
    console.error('Use --list to see available commands');
    process.exit(1);
  }

  console.log(`Connecting to Apple TV at ${host}:${port}...`);

  const api = new CompanionAPI(host, port, credentials);

  try {
    await api.connect();
    console.log('Connected!\n');

    console.log(`Sending command: ${cmd}`);
    await api.pressButton(hidCommand);

    console.log('Command sent successfully!');

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
