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

  constructor(
    public readonly host: string,
    public readonly port: number,
    private credentials?: HapCredentials
  ) {
    super();
  }

  /**
   * Connect to Apple TV
   */
  async connect(): Promise<void> {
    if (this.protocol) {
      return;
    }

    this.connection = new CompanionConnection(this.host, this.port);
    const srp = new SRPAuthHandler();
    this.protocol = new CompanionProtocol(this.connection, srp);

    this.protocol.on('event', (name: string, data: Record<string, unknown>) => {
      this.emit('event', name, data);
    });

    await this.protocol.start(this.credentials);

    await this.systemInfo();
    await this.touchStart();
    await this.sessionStart();
    await this.subscribeEvent('_iMC');
  }

  /**
   * Disconnect from Apple TV
   */
  async disconnect(): Promise<void> {
    if (!this.protocol) {
      return;
    }

    try {
      for (const event of this.subscribedEvents) {
        await this.unsubscribeEvent(event);
      }
      await this.sessionStop();
      await this.touchStop();
    } catch {
      // Ignore errors during disconnect
    } finally {
      this.protocol.stop();
      this.protocol = null;
      this.connection = null;
    }
  }

  /**
   * Send system information to device
   */
  async systemInfo(): Promise<void> {
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
    });
  }

  /**
   * Launch an app by bundle ID or URL
   */
  async launchApp(bundleIdOrUrl: string): Promise<void> {
    const isUrl = bundleIdOrUrl.includes('://') || bundleIdOrUrl.includes(':');
    const key = isUrl ? '_urlS' : '_bundleID';
    await this.sendCommand('_launchApp', { [key]: bundleIdOrUrl });
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
  async hidCommand(down: boolean, command: HidCommand): Promise<void> {
    await this.sendCommand('_hidC', {
      _hBtS: down ? 1 : 2,
      _hidC: command,
    });
  }

  /**
   * Press and release a button
   */
  async pressButton(command: HidCommand): Promise<void> {
    await this.hidCommand(true, command);
    await this.hidCommand(false, command);
  }

  /**
   * Send media control command
   */
  async mediaControlCommand(
    command: MediaControlCommand,
    args?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.sendCommand('_mcc', {
      _mcc: command,
      ...args,
    });
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
  async play(): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.Play);
  }

  /**
   * Pause media
   */
  async pause(): Promise<void> {
    await this.mediaControlCommand(MediaControlCommand.Pause);
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
  async fetchAttentionState(): Promise<SystemStatus> {
    const resp = await this.sendCommand('FetchAttentionState', {});
    const content = resp._c as Record<string, unknown>;
    return (content?.state as SystemStatus) || SystemStatus.Unknown;
  }

  /**
   * Subscribe to event updates
   */
  async subscribeEvent(event: string): Promise<void> {
    if (!this.subscribedEvents.includes(event)) {
      await this.sendEvent('_interest', { _regEvents: [event] });
      this.subscribedEvents.push(event);
    }
  }

  /**
   * Unsubscribe from event updates
   */
  async unsubscribeEvent(event: string): Promise<void> {
    const index = this.subscribedEvents.indexOf(event);
    if (index !== -1) {
      await this.sendEvent('_interest', { _deregEvents: [event] });
      this.subscribedEvents.splice(index, 1);
    }
  }

  private async sessionStart(): Promise<void> {
    const localSid = Math.floor(Math.random() * 0xffffffff);
    const resp = await this.sendCommand('_sessionStart', {
      _srvT: 'com.apple.tvremoteservices',
      _sid: localSid,
    });
    const content = resp._c as Record<string, unknown>;
    const remoteSid = (content?._sid as number) || 0;
    this.sid = (remoteSid * 0x100000000) + localSid;
  }

  private async sessionStop(): Promise<void> {
    await this.sendCommand('_sessionStop', {
      _srvT: 'com.apple.tvremoteservices',
      _sid: this.sid,
    });
  }

  private async touchStart(): Promise<void> {
    this.baseTimestamp = Date.now();
    await this.sendCommand('_touchStart', {
      _height: TOUCHPAD_HEIGHT,
      _tFl: 0,
      _width: TOUCHPAD_WIDTH,
    });
  }

  private async touchStop(): Promise<void> {
    await this.sendCommand('_touchStop', { _i: 1 });
  }

  private async sendCommand(
    identifier: string,
    content: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.protocol) {
      throw new Error('Not connected');
    }

    return this.protocol.exchangeOpack(FrameType.E_OPACK, {
      _i: identifier,
      _t: MessageType.Request,
      _c: content,
    });
  }

  private async sendEvent(
    identifier: string,
    content: Record<string, unknown>
  ): Promise<void> {
    if (!this.protocol) {
      throw new Error('Not connected');
    }

    this.protocol.sendOpack(FrameType.E_OPACK, {
      _i: identifier,
      _t: MessageType.Event,
      _c: content,
    });
  }
}
