/**
 * ATV-Companion - TypeScript SDK for Apple TV Companion Protocol
 *
 * Provides scan, pair, and remote control functionality for Apple TV devices.
 *
 * Ported from: pyatv (https://github.com/postlund/pyatv)
 */

// Protocol layer
export {
  CompanionConnection,
  CompanionProtocol,
  CompanionAPI,
  CompanionPairSetupProcedure,
  CompanionPairVerifyProcedure,
  FrameType,
  MessageType,
  HidCommand,
  MediaControlCommand,
  SystemStatus,
  TouchAction,
} from './protocol/index.js';

// Authentication
export { SRPAuthHandler } from './auth/srp.js';
export type { HapCredentials } from './auth/credentials.js';

// Support modules
export { pack, unpack, SizedInt } from './support/opack.js';
export { readTlv, writeTlv, TlvValue } from './support/tlv8.js';
export { Chacha20Cipher, Chacha20Cipher8byteNonce } from './support/chacha20.js';
export {
  generateEd25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  generateX25519KeyPair,
  x25519SharedSecret,
  hkdfExpand,
} from './support/crypto.js';

// Errors
export {
  ATVError,
  ConnectionError,
  AuthenticationError,
  PairingError,
  TimeoutError,
} from './errors.js';

// Scanner
export {
  AppleTVScanner,
  scan,
  supportsPairing,
  isPairingDisabled,
  type AppleTVDevice,
  type ScannerOptions,
} from './scanner/index.js';
