import { Socket } from 'net';

import { abortError, operationTimeoutMs } from '../protocol/operation.js';

export const DEFAULT_WAKE_COMPATIBILITY_PORTS = [
  3689,
  7000,
  49152,
  32498,
] as const;

export type CompanionKnockPortStatus =
  | 'connected'
  | 'timeout'
  | 'refused'
  | 'unreachable';

export interface CompanionKnockOptions {
  ports?: readonly number[];
  timeoutMs?: number;
  connectionHoldMs?: number;
  signal?: AbortSignal;
}

export interface CompanionKnockPortResult {
  port: number;
  status: CompanionKnockPortStatus;
  durationMs: number;
}

export interface CompanionKnockResult {
  host: string;
  results: CompanionKnockPortResult[];
}

interface KnockBatchState {
  hostUnreachable: boolean;
  sockets: Set<Socket>;
}

const DEFAULT_CONNECTION_HOLD_MS = 100;

export async function knock(
  host: string,
  options: CompanionKnockOptions = {}
): Promise<CompanionKnockResult> {
  const ports = options.ports ?? DEFAULT_WAKE_COMPATIBILITY_PORTS;
  const timeoutMs = operationTimeoutMs(options);
  const connectionHoldMs = options.connectionHoldMs ?? DEFAULT_CONNECTION_HOLD_MS;
  validateKnockOptions(host, ports, connectionHoldMs);

  if (options.signal?.aborted) {
    throw abortError(options.signal);
  }

  const state: KnockBatchState = {
    hostUnreachable: false,
    sockets: new Set(),
  };
  const abortBatch = (): void => {
    for (const socket of state.sockets) {
      socket.destroy();
    }
  };

  options.signal?.addEventListener('abort', abortBatch, { once: true });
  try {
    const results = await Promise.all(
      ports.map((port) =>
        knockPort(host, port, timeoutMs, connectionHoldMs, options.signal, state)
      )
    );
    if (options.signal?.aborted) {
      throw abortError(options.signal);
    }
    return { host, results };
  } finally {
    options.signal?.removeEventListener('abort', abortBatch);
    abortBatch();
  }
}

function knockPort(
  host: string,
  port: number,
  timeoutMs: number,
  connectionHoldMs: number,
  signal: AbortSignal | undefined,
  state: KnockBatchState
): Promise<CompanionKnockPortResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    if (state.hostUnreachable) {
      resolve({ port, status: 'unreachable', durationMs: 0 });
      return;
    }

    const socket = new Socket();
    const startedAt = Date.now();
    let settled = false;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      clearTimeout(timeoutTimer);
      if (holdTimer) {
        clearTimeout(holdTimer);
      }
      signal?.removeEventListener('abort', handleAbort);
      state.sockets.delete(socket);
      socket.removeAllListeners();
      socket.destroy();
    };
    const complete = (status: CompanionKnockPortStatus): void => {
      if (settled) {
        return;
      }
      settled = true;
      const durationMs = Date.now() - startedAt;
      cleanup();
      resolve({ port, status, durationMs });
    };
    const handleAbort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(abortError(signal));
    };
    const timeoutTimer = setTimeout(() => complete('timeout'), timeoutMs);

    state.sockets.add(socket);
    signal?.addEventListener('abort', handleAbort, { once: true });
    socket.setNoDelay(true);
    socket.once('connect', () => {
      holdTimer = setTimeout(() => complete('connected'), connectionHoldMs);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        complete('refused');
        return;
      }
      if (
        error.code === 'EHOSTUNREACH' ||
        error.code === 'ENETUNREACH' ||
        error.code === 'EHOSTDOWN'
      ) {
        state.hostUnreachable = true;
        for (const pendingSocket of state.sockets) {
          if (pendingSocket !== socket) {
            pendingSocket.destroy();
          }
        }
        complete('unreachable');
        return;
      }
      complete('unreachable');
    });
    socket.once('close', () => {
      if (!settled && state.hostUnreachable) {
        complete('unreachable');
      }
    });
    socket.connect(port, host);
  });
}

function validateKnockOptions(
  host: string,
  ports: readonly number[],
  connectionHoldMs: number
): void {
  if (!host.trim()) {
    throw new TypeError('host must not be empty');
  }
  if (ports.length === 0) {
    throw new RangeError('ports must not be empty');
  }
  for (const port of ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new RangeError(`Invalid TCP port: ${port}`);
    }
  }
  if (!Number.isFinite(connectionHoldMs) || connectionHoldMs < 0) {
    throw new RangeError('connectionHoldMs must be a non-negative finite number');
  }
}
