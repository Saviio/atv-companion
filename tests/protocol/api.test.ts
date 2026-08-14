import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CompanionAPI,
  CompanionConnection,
  CompanionProtocol,
  HidCommand,
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
});
