import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CompanionAPI,
  CompanionConnection,
  CompanionProtocol,
  HidCommand,
  MediaControlCommand,
  SystemStatus,
} from '../../src/index.js';

interface CompanionApiTestAccess {
  sendCommand(
    identifier: string,
    content: Record<string, unknown>,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<Record<string, unknown>>;
}

interface CompanionApiLifecycleTestAccess {
  touchStart(): Promise<void>;
  sessionStart(): Promise<void>;
  gracefulDisconnect(): Promise<void>;
}

describe('CompanionAPI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends release-only wake and sleep commands', async () => {
    const api = new CompanionAPI('127.0.0.1', 12345);
    const sendCommand = vi
      .spyOn(api as unknown as CompanionApiTestAccess, 'sendCommand')
      .mockResolvedValue({});

    await api.wake({ timeoutMs: 250 });
    await api.sleep({ timeoutMs: 250 });

    expect(sendCommand).toHaveBeenNthCalledWith(
      1,
      '_hidC',
      { _hBtS: 2, _hidC: HidCommand.Wake },
      { timeoutMs: 250 }
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      2,
      '_hidC',
      { _hBtS: 2, _hidC: HidCommand.Sleep },
      { timeoutMs: 250 }
    );
  });

  it('passes deeplinks through unchanged', async () => {
    const api = new CompanionAPI('127.0.0.1', 12345);
    const sendCommand = vi
      .spyOn(api as unknown as CompanionApiTestAccess, 'sendCommand')
      .mockResolvedValue({});
    const deeplink = 'plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F42';

    await api.launchApp(deeplink);

    expect(sendCommand).toHaveBeenCalledWith(
      '_launchApp',
      { _urlS: deeplink },
      undefined
    );
  });

  it('threads cancellation options through remote commands', async () => {
    const api = new CompanionAPI('127.0.0.1', 12345);
    const sendCommand = vi
      .spyOn(api as unknown as CompanionApiTestAccess, 'sendCommand')
      .mockResolvedValue({});
    const controller = new AbortController();
    const options = { timeoutMs: 250, signal: controller.signal };

    await api.pressButton(HidCommand.Select, options);
    await api.play(options);
    await api.pause(options);

    expect(sendCommand).toHaveBeenNthCalledWith(
      1,
      '_hidC',
      { _hBtS: 1, _hidC: HidCommand.Select },
      options
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      2,
      '_hidC',
      { _hBtS: 2, _hidC: HidCommand.Select },
      options
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      3,
      '_mcc',
      { _mcc: MediaControlCommand.Play },
      options
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      4,
      '_mcc',
      { _mcc: MediaControlCommand.Pause },
      options
    );
  });

  it('returns the reported system status', async () => {
    const api = new CompanionAPI('127.0.0.1', 12345);
    vi.spyOn(api as unknown as CompanionApiTestAccess, 'sendCommand').mockResolvedValue({
      _c: { state: SystemStatus.Screensaver },
    });

    await expect(api.fetchAttentionState()).resolves.toBe(SystemStatus.Screensaver);
  });

  it('shares concurrent connect initialization', async () => {
    let releaseStart: (() => void) | undefined;
    const start = vi.spyOn(CompanionProtocol.prototype, 'start').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseStart = resolve;
        })
    );
    vi.spyOn(CompanionAPI.prototype, 'systemInfo').mockResolvedValue();
    vi.spyOn(CompanionAPI.prototype, 'subscribeEvent').mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'touchStart'
    ).mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'sessionStart'
    ).mockResolvedValue();
    vi.spyOn(CompanionConnection.prototype, 'close').mockImplementation(() => undefined);
    const api = new CompanionAPI('127.0.0.1', 12345);

    const first = api.connect();
    const second = api.connect();
    expect(start).toHaveBeenCalledTimes(1);

    releaseStart?.();
    await Promise.all([first, second]);
    await api.disconnect();
  });

  it('can retry after connection initialization fails', async () => {
    const start = vi
      .spyOn(CompanionProtocol.prototype, 'start')
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce();
    vi.spyOn(CompanionAPI.prototype, 'systemInfo').mockResolvedValue();
    vi.spyOn(CompanionAPI.prototype, 'subscribeEvent').mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'touchStart'
    ).mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'sessionStart'
    ).mockResolvedValue();
    vi.spyOn(CompanionConnection.prototype, 'close').mockImplementation(() => undefined);
    const api = new CompanionAPI('127.0.0.1', 12345);

    await expect(api.connect()).rejects.toThrow('first failure');
    await expect(api.connect()).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledTimes(2);
    await api.disconnect();
  });

  it('waits for an active disconnect before reconnecting', async () => {
    let releaseDisconnect: (() => void) | undefined;
    const start = vi.spyOn(CompanionProtocol.prototype, 'start').mockResolvedValue();
    vi.spyOn(CompanionConnection.prototype, 'connected', 'get').mockReturnValue(true);
    vi.spyOn(CompanionAPI.prototype, 'systemInfo').mockResolvedValue();
    vi.spyOn(CompanionAPI.prototype, 'subscribeEvent').mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'touchStart'
    ).mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'sessionStart'
    ).mockResolvedValue();
    vi.spyOn(
      CompanionAPI.prototype as unknown as CompanionApiLifecycleTestAccess,
      'gracefulDisconnect'
    ).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseDisconnect = resolve;
        })
    );
    vi.spyOn(CompanionConnection.prototype, 'close').mockImplementation(() => undefined);
    const api = new CompanionAPI('127.0.0.1', 12345);

    await api.connect();
    const disconnect = api.disconnect();
    const reconnect = api.connect();

    expect(start).toHaveBeenCalledTimes(1);
    releaseDisconnect?.();
    await disconnect;
    await reconnect;

    expect(start).toHaveBeenCalledTimes(2);
    await api.disconnect();
  });
});
