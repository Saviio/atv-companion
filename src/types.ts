/**
 * Type definitions for ATV-Companion SDK
 */

/**
 * Options for scanning Apple TV devices
 */
export interface ScanOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Specific host to scan (unicast mode) */
  host?: string;
}

/**
 * Result of a device scan
 */
export interface ScanResult {
  /** Device name */
  name: string;
  /** IP address or hostname */
  host: string;
  /** Companion protocol port */
  port: number;
  /** Device model identifier (e.g., "AppleTV6,2") */
  model?: string;
  /** Unique device identifier */
  identifier?: string;
}

/**
 * Options for pairing with an Apple TV
 */
export interface PairOptions {
  /** IP address or hostname */
  host: string;
  /** Companion protocol port */
  port: number;
  /** PIN code displayed on Apple TV screen */
  pin: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Options for connecting to an Apple TV
 */
export interface ConnectOptions {
  /** IP address or hostname */
  host: string;
  /** Companion protocol port */
  port: number;
  /** Credentials from pairing */
  credentials: Credentials;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Credentials obtained from pairing
 */
export interface Credentials {
  /** Long-term public key (hex) */
  ltpk: string;
  /** Long-term secret key (hex) */
  ltsk: string;
  /** Client identifier */
  clientId: string;
  /** Apple TV identifier */
  atvId: string;
}

/**
 * Device information
 */
export interface DeviceInfo {
  name: string;
  model?: string;
  osVersion?: string;
  identifier?: string;
}

/**
 * HID command types for remote control
 */
export enum HidCommand {
  Up = 1,
  Down = 2,
  Left = 3,
  Right = 4,
  Menu = 5,
  Select = 6,
  Home = 7,
  VolumeUp = 8,
  VolumeDown = 9,
  Siri = 10,
  Screensaver = 11,
  Sleep = 12,
  Wake = 13,
  PlayPause = 14,
  ChannelUp = 15,
  ChannelDown = 16,
  Guide = 17,
  PageUp = 18,
  PageDown = 19,
}

/**
 * Media control command types
 */
export enum MediaCommand {
  Play = 1,
  Pause = 2,
  NextTrack = 3,
  PreviousTrack = 4,
  GetVolume = 5,
  SetVolume = 6,
  SkipBy = 7,
  FastForwardBegin = 8,
  FastForwardEnd = 9,
  RewindBegin = 10,
  RewindEnd = 11,
}

/**
 * Input action types
 */
export enum InputAction {
  SingleTap = 'single',
  DoubleTap = 'double',
  Hold = 'hold',
}

/**
 * Frame types for Companion protocol
 */
export enum FrameType {
  NoOp = 0x00,
  PS_Start = 0x03,
  PS_Next = 0x04,
  PV_Start = 0x05,
  PV_Next = 0x06,
  U_OPACK = 0x07,
  E_OPACK = 0x08,
  P_OPACK = 0x09,
  PA_Req = 0x0a,
  PA_Rsp = 0x0b,
  SessionData = 0x0c,
  FamilyIdentityRequest = 0x0d,
  FamilyIdentityResponse = 0x0e,
  FamilyIdentityUpdate = 0x0f,
}

/**
 * Message types in OPACK messages
 */
export enum MessageType {
  Event = 1,
  Request = 2,
  Response = 3,
}

/**
 * TLV8 value types for HAP
 */
export enum TlvValue {
  Method = 0x00,
  Identifier = 0x01,
  Salt = 0x02,
  PublicKey = 0x03,
  Proof = 0x04,
  EncryptedData = 0x05,
  SeqNo = 0x06,
  Error = 0x07,
  BackOff = 0x08,
  Certificate = 0x09,
  Signature = 0x0a,
  Permissions = 0x0b,
  FragmentData = 0x0c,
  FragmentLast = 0x0d,
  Name = 0x11,
  Flags = 0x13,
}
