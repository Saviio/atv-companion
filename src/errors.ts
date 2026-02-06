/**
 * Error types for ATV-Companion SDK
 */

/**
 * Base error class for all ATV errors
 */
export class ATVError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ATVError';
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends ATVError {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends ATVError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Pairing-related errors
 */
export class PairingError extends ATVError {
  constructor(message: string) {
    super(message);
    this.name = 'PairingError';
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends ATVError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Protocol errors
 */
export class ProtocolError extends ATVError {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}
