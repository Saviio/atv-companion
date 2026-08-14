/**
 * High level implementation of Companion API
 *
 * Provides methods for controlling Apple TV via Companion protocol.
 *
 * Ported from: pyatv/protocols/companion/api.py
 */

import { EventEmitter } from 'events';
import { CompanionConnection, FrameType } from './connection.js';
import { CompanionProtocol, MessageType } from './protocol.js';
import { SRPAuthHandler } from '../auth/srp.js';
import type { HapCredentials } from '../auth/credentials.js';
import {
  throwIfAborted,
  type CompanionOperationOptions,
} from './operation.js';

/**
 * HID command constants
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
  ChannelIncrement = 15,
  ChannelDecrement = 16,
  Guide = 17,
  PageUp = 18,
  PageDown = 19,
}

/**
 * Media control command constants
 */
export enum MediaControlCommand {
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
  GetCaptionSettings = 12,
  SetCaptionSettings = 13,
}

/**
 * System status values
 */
export enum SystemStatus {
  Unknown = 0x00,
  Asleep = 0x01,
  Screensaver = 0x02,
  Awake = 0x03,
  Idle = 0x04,
}

/**
 * Touch action modes
 */
export enum TouchAction {
  Press = 1,
  Hold = 3,
  Release = 4,
  Click = 5,
}

const TOUCHPAD_WIDTH = 1000;
const TOUCHPAD_HEIGHT = 1000;

/**
 * Companion API for controlling Apple TV
 */
export class CompanionAPI extends EventEmitter {
  private connection: CompanionConnection | null = null;
  private protocol: CompanionProtocol | null = null;
  private subscribedEvents: string[] = [];
  private sid = 0;
  private baseTimestamp = Date.now();
  private connectPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;
  private protocolEventListener:
    | ((name: string, data: Record<string, unknown>) => void)
    | null = null;
  private protocolErrorListener: ((error: Error) => void) | null = null;
  private protocolDisconnectedListener: ((error?: Error) => void) | null = null;

  constructor(
    public readonly host: string,
    public readonly port: number,
    private credentials?: HapCredentials
  ) {
    super();
  }

  get connected(): boolean {
    return Boolean(this.protocol && this.connection?.connected);
  }

  /**
   * Connect to Apple TV
   */
  async connect(options?: CompanionOperationOptions): Promise<void> {
    if (this.disconnectPromise) {
      await this.disconnectPromise;
      throwIfAborted(options?.signal);
    }
    if (this.connected) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.performConnect(options);
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async performConnect(options?: CompanionOperationOptions): Promise<void> {
    this.resetTransport();
    throwIfAborted(options?.signal);

    const connection = new CompanionConnection(this.host, this.port);
    const protocol = new CompanionProtocol(connection, new SRPAuthHandler());
    this.connection = connection;
    this.protocol = protocol;

    this.protocolEventListener = (name, data) => {
      this.emit('event', name, data);
    };
    this.protocolErrorListener = (error) => {
      this.emitIfObserved('error', error);
    };
    this.protocolDisconnectedListener = (error) => {
      this.emit('disconnected', error);
    };
    protocol.on('event', this.protocolEventListener);
    protocol.on('error', this.protocolErrorListener);
    protocol.on('disconnected', this.protocolDisconnectedListener);

    try {
      await protocol.start(this.credentials, options);
      await this.systemInfo(options);
      await this.touchStart(options);
      await this.sessionStart(options);
      await this.subscribeEvent('_iMC', options);
    } catch (error) {
      this.resetTransport();
      throw error;
    }
  }

  /**
   * Disconnect from Apple TV
   */
  async disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }
    if (!this.protocol && !this.connection) {
      return;
    }

    this.disconnectPromise = this.performDisconnect();
    try {
      await this.disconnectPromise;
    } finally {
      this.disconnectPromise = null;
    }
  }

  private async performDisconnect(): Promise<void> {
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.gracefulDisconnect(),
        new Promise<void>((resolve) => {
          forceTimer = setTimeout(resolve, 1_000);
        }),
      ]);
    } catch {
      // Best-effort graceful shutdown. Transport cleanup below is authoritative.
    } finally {
      if (forceTimer) {
        clearTimeout(forceTimer);
      }
      this.resetTransport();
    }
  }

  private async gracefulDisconnect(): Promise<void> {
    for (const event of [...this.subscribedEvents]) {
      await this.unsubscribeEvent(event, { timeoutMs: 750 });
    }
    await this.sessionStop({ timeoutMs: 750 });
    await this.touchStop({ timeoutMs: 750 });
  }

  /**
   * Send system information to device
   */
  async systemInfo(options?: CompanionOperationOptions): Promise<void> {
    await this.sendCommand('_systemInfo', {
      _bf: 0,
      _cf: 512,
      _clFl: 128,
      _i: 'atv-companion',
      _idsID: this.credentials?.clientId?.toString('hex') || 'unknown',
      _pubID: 'AA:BB:CC:DD:EE:FF',
      _sf: 256,
      _sv: '170.18',
      model: 'iPhone',
      name: 'atv-companion',
    }, options);
  }

  /**
   * Launch an app by bundle ID or URL
   */
  async launchApp(
    bundleIdOrUrl: string,
    options?: CompanionOperationOptions
  ): Promise<void> {
    const isUrl = bundleIdOrUrl.includes('://') || bundleIdOrUrl.includes(':');
    const key = isUrl ? '_urlS' : '_bundleID';
    await this.sendCommand('_launchApp', { [key]: bundleIdOrUrl }, options);
  }

  /**
   * Get list of installed apps
   */
  async appList(): Promise<Record<string, unknown>> {
    return this.sendCommand('FetchLaunchableApplicationsEvent', {});
  }

  /**
   * Send HID command (button press)
   */
  async hidCommand(
    down: boolean,
    command: HidCommand,
    options?: CompanionOperationOptions
  ): Promise<void> {
    await this.sendCommand('_hidC', {
      _hBtS: down ? 1 : 2,
      _hidC: command,
    }, options);
  }

  async wake(options?: CompanionOperationOptions): Promise<void> {
    await this.hidCommand(false, HidCommand.Wake, options);
  }

  async sleep(options?: CompanionOperationOptions): Promise<void> {
    await this.hidCommand(false, HidCommand.Sleep, options);
  }

  /**
   * Press and release a button
   */
  async pressButton(
    command: HidCommand,
    options?: CompanionOperationOptions
  ): Promise<void> {
    await this.hidCommand(true, command, options);
    await this.hidCommand(false, command, options);
  }

  /**
   * Send media control command
   */
  async mediaControlCommand(
    command: MediaControlCommand,
    args?: Record<string, unknown>,
    options?: CompanionOperationOptions
  ): Promise<Record<string, unknown>> {
    return this.sendCommand('_mcc', {
      _mcc: command,
      ...args,
    }, options);
  }

  /**
   * Get current volume (0-1)
   */
  async getVolume(): Promise<number> {
    const resp = await this.mediaControlCommand(MediaControlCommand.GetVolume);
    const content = resp._c as Record<string, unknown>;
    return (content?._vol as number) || 0;
  }

  /**
   * Set volume (0-1)
   */
  async setVolume(volume: number): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.SetVolume, {
      _vol: Math.max(0, Math.min(1, volume)),
    });
  }

  /**
   * Play media
   */
  async play(options?: CompanionOperationOptions): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.Play, undefined, options);
  }

  /**
   * Pause media
   */
  async pause(options?: CompanionOperationOptions): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.Pause, undefined, options);
  }

  /**
   * Next track
   */
  async nextTrack(): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.NextTrack);
  }

  /**
   * Previous track
   */
  async previousTrack(): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.PreviousTrack);
  }

  /**
   * Get system status (awake, asleep, etc.)
   */
  async fetchAttentionState(
    options?: CompanionOperationOptions
  ): Promise<SystemStatus> {
    const resp = await this.sendCommand('FetchAttentionState', {}, options);
    const content = resp._c as Record<string, unknown>;
    return (content?.state as SystemStatus) || SystemStatus.Unknown;
  }

  /**
   * Subscribe to event updates
   */
  async subscribeEvent(
    event: string,
    options?: CompanionOperationOptions
  ): Promise<void> {
    if (!this.subscribedEvents.includes(event)) {
      await this.sendEvent('_interest', { _regEvents: [event] }, options);
      this.subscribedEvents.push(event);
    }
  }

  /**
   * Unsubscribe from event updates
   */
  async unsubscribeEvent(
    event: string,
    options?: CompanionOperationOptions
  ): Promise<void> {
    const index = this.subscribedEvents.indexOf(event);
    if (index !== -1) {
      await this.sendEvent('_interest', { _deregEvents: [event] }, options);
      this.subscribedEvents.splice(index, 1);
    }
  }

  private async sessionStart(options?: CompanionOperationOptions): Promise<void> {
    const localSid = Math.floor(Math.random() * 0xffffffff);
    const resp = await this.sendCommand('_sessionStart', {
      _srvT: 'com.apple.tvremoteservices',
      _sid: localSid,
    }, options);
    const content = resp._c as Record<string, unknown>;
    const remoteSid = (content?._sid as number) || 0;
    this.sid = (remoteSid * 0x100000000) + localSid;
  }

  private async sessionStop(options?: CompanionOperationOptions): Promise<void> {
    await this.sendCommand('_sessionStop', {
      _srvT: 'com.apple.tvremoteservices',
      _sid: this.sid,
    }, options);
  }

  private async touchStart(options?: CompanionOperationOptions): Promise<void> {
    this.baseTimestamp = Date.now();
    await this.sendCommand('_touchStart', {
      _height: TOUCHPAD_HEIGHT,
      _tFl: 0,
      _width: TOUCHPAD_WIDTH,
    }, options);
  }

  private async touchStop(options?: CompanionOperationOptions): Promise<void> {
    await this.sendCommand('_touchStop', { _i: 1 }, options);
  }

  private async sendCommand(
    identifier: string,
    content: Record<string, unknown>,
    options?: CompanionOperationOptions
  ): Promise<Record<string, unknown>> {
    if (!this.protocol) {
      throw new Error('Not connected');
    }

    return this.protocol.exchangeOpack(FrameType.E_OPACK, {
      _i: identifier,
      _t: MessageType.Request,
      _c: content,
    }, options);
  }

  private async sendEvent(
    identifier: string,
    content: Record<string, unknown>,
    options?: CompanionOperationOptions
  ): Promise<void> {
    if (!this.protocol) {
      throw new Error('Not connected');
    }

    throwIfAborted(options?.signal);
    this.protocol.sendOpack(FrameType.E_OPACK, {
      _i: identifier,
      _t: MessageType.Event,
      _c: content,
    });
  }

  private resetTransport(): void {
    const protocol = this.protocol;
    if (protocol) {
      if (this.protocolEventListener) {
        protocol.removeListener('event', this.protocolEventListener);
      }
      if (this.protocolErrorListener) {
        protocol.removeListener('error', this.protocolErrorListener);
      }
      if (this.protocolDisconnectedListener) {
        protocol.removeListener('disconnected', this.protocolDisconnectedListener);
      }
      protocol.stop();
    } else {
      this.connection?.close();
    }
    this.protocol = null;
    this.connection = null;
    this.protocolEventListener = null;
    this.protocolErrorListener = null;
    this.protocolDisconnectedListener = null;
    this.subscribedEvents = [];
    this.sid = 0;
  }

  private emitIfObserved(event: string, error: Error): void {
    if (this.listenerCount(event) > 0) {
      this.emit(event, error);
    }
  }
}
