/**
 * Protocol module exports
 */

export {
  CompanionConnection,
  FrameType,
  AUTH_TAG_LENGTH,
  HEADER_LENGTH,
} from './connection.js';

export {
  CompanionProtocol,
  MessageType,
  SRP_SALT,
  SRP_OUTPUT_INFO,
  SRP_INPUT_INFO,
} from './protocol.js';

export {
  CompanionPairSetupProcedure,
  CompanionPairVerifyProcedure,
} from './pairing.js';

export {
  CompanionAPI,
  HidCommand,
  MediaControlCommand,
  SystemStatus,
  TouchAction,
} from './api.js';
