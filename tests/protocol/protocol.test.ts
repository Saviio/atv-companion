import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

import { CompanionProtocol, FrameType } from '../../src/index.js';
import type { CompanionConnection } from '../../src/index.js';

class ProtocolTestConnection extends EventEmitter {
  send = vi.fn();
  close = vi.fn();
}

describe('CompanionProtocol lifecycle', () => {
  it('removes a pending exchange when its signal is aborted', async () => {
    const connection = new ProtocolTestConnection();
    const protocol = new CompanionProtocol(
      connection as unknown as CompanionConnection
    );
    const controller = new AbortController();

    const exchange = protocol.exchangeOpack(
      FrameType.E_OPACK,
      { _i: 'test' },
      { timeoutMs: 1_000, signal: controller.signal }
    );
    controller.abort(new Error('cancelled'));

    await expect(exchange).rejects.toMatchObject({ name: 'AbortError' });
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(
      (protocol as unknown as { queues: Map<unknown, unknown> }).queues.size
    ).toBe(0);
  });

  it('stops the transport when a command times out', async () => {
    vi.useFakeTimers();
    const connection = new ProtocolTestConnection();
    const protocol = new CompanionProtocol(
      connection as unknown as CompanionConnection
    );

    const exchange = protocol.exchangeOpack(
      FrameType.E_OPACK,
      { _i: 'test' },
      { timeoutMs: 20 }
    );
    const rejection = expect(exchange).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(20);

    await rejection;
    expect(connection.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('forwards an active transport close as a disconnected event', () => {
    const connection = new ProtocolTestConnection();
    const protocol = new CompanionProtocol(
      connection as unknown as CompanionConnection
    );
    const disconnected = vi.fn();
    protocol.on('disconnected', disconnected);
    (
      protocol as unknown as {
        isStarted: boolean;
      }
    ).isStarted = true;

    connection.emit('disconnected');

    expect(disconnected).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
