import { createServer, type Server } from 'net';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_WAKE_COMPATIBILITY_PORTS,
  knock,
} from '../../src/index.js';

describe('knock', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
    );
  });

  it('connects to all requested ports in parallel and closes them', async () => {
    const first = await listen();
    const second = await listen();
    const startedAt = Date.now();

    const result = await knock('127.0.0.1', {
      ports: [portOf(first), portOf(second)],
      timeoutMs: 500,
      connectionHoldMs: 100,
    });

    expect(result.host).toBe('127.0.0.1');
    expect(result.results.map((item) => item.status)).toEqual([
      'connected',
      'connected',
    ]);
    expect(Date.now() - startedAt).toBeLessThan(190);
  });

  it('reports refused ports without rejecting the batch', async () => {
    const server = await listen();
    const port = portOf(server);
    await close(server);

    const result = await knock('127.0.0.1', {
      ports: [port],
      timeoutMs: 500,
    });

    expect(result.results).toEqual([
      expect.objectContaining({ port, status: 'refused' }),
    ]);
  });

  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      knock('127.0.0.1', {
        ports: DEFAULT_WAKE_COMPATIBILITY_PORTS,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  async function listen(): Promise<Server> {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
  }

  function portOf(server: Server): number {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }
    return address.port;
  }

  async function close(server: Server): Promise<void> {
    const index = servers.indexOf(server);
    if (index >= 0) {
      servers.splice(index, 1);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
