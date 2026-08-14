import { AbortError, TimeoutError } from '../errors.js';

export interface CompanionOperationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export const DEFAULT_OPERATION_TIMEOUT_MS = 5_000;

export function operationTimeoutMs(
  options: CompanionOperationOptions | number | undefined
): number {
  const value = typeof options === 'number' ? options : options?.timeoutMs;
  if (value === undefined) {
    return DEFAULT_OPERATION_TIMEOUT_MS;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('timeoutMs must be a positive finite number');
  }
  return value;
}

export function operationSignal(
  options: CompanionOperationOptions | number | undefined
): AbortSignal | undefined {
  return typeof options === 'number' ? undefined : options?.signal;
}

export function abortError(signal?: AbortSignal): AbortError {
  const reason = signal?.reason;
  if (reason instanceof Error && reason.message) {
    return new AbortError(reason.message);
  }
  return new AbortError();
}

export function timeoutError(timeoutMs: number): TimeoutError {
  return new TimeoutError(`Operation timed out after ${timeoutMs}ms`);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}
