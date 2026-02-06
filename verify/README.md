# Verify Scripts

These scripts help you test and verify the atv-companion SDK functionality.

## Quick Start

1. **Scan for devices:**
   ```bash
   npx tsx verify/scan-devices.ts
   ```

2. **Pair with a device:**
   ```bash
   npx tsx verify/pair-device.ts --host=<IP>
   ```
   Follow the prompts to enter the PIN shown on your Apple TV.

3. **Set credentials:**
   ```bash
   export ATV_CREDENTIALS="<base64 credentials from pairing>"
   ```

4. **Use other scripts:**
   ```bash
   npx tsx verify/wake-device.ts --host=<IP>
   npx tsx verify/send-deeplink.ts --host=<IP> --url=netflix://
   ```

## Available Scripts

| Script | Description |
|--------|-------------|
| `scan-devices.ts` | Scan for Apple TV devices on the network |
| `pair-device.ts` | Pair with an Apple TV (get credentials) |
| `wake-device.ts` | Wake up (turn on) Apple TV |
| `sleep-device.ts` | Put Apple TV to sleep |
| `send-deeplink.ts` | Open a URL/deeplink on Apple TV |
| `launch-app.ts` | Launch an app by bundle ID |
| `remote-control.ts` | Send remote control commands |

## Examples

### Scan for devices
```bash
# Basic scan (5 second timeout)
npx tsx verify/scan-devices.ts

# Extended scan with verbose output
npx tsx verify/scan-devices.ts --timeout=10000 --verbose
```

### Launch apps
```bash
# Using shortcut
npx tsx verify/launch-app.ts --host=192.168.1.100 --app=netflix

# Using bundle ID
npx tsx verify/launch-app.ts --host=192.168.1.100 --app=com.netflix.Netflix

# List available shortcuts
npx tsx verify/launch-app.ts --list
```

### Send deeplinks
```bash
# Open Netflix
npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url=netflix://

# Open specific YouTube video
npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url="youtube://watch?v=dQw4w9WgXcQ"

# Open Apple TV+ content
npx tsx verify/send-deeplink.ts --host=192.168.1.100 --url="https://tv.apple.com/show/..."
```

### Remote control
```bash
# Navigate
npx tsx verify/remote-control.ts --host=192.168.1.100 --cmd=up
npx tsx verify/remote-control.ts --host=192.168.1.100 --cmd=select

# List all commands
npx tsx verify/remote-control.ts --list
```

## Common Deeplink Schemes

| App | Scheme |
|-----|--------|
| Netflix | `netflix://` |
| YouTube | `youtube://` |
| Disney+ | `disneyplus://` |
| Prime Video | `aiv://` |
| HBO Max | `hbomax://` |
| Apple TV+ | `https://tv.apple.com/...` |
| Spotify | `spotify://` |
| Twitch | `twitch://` |
