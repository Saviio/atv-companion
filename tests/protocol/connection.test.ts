/**
 * Connection tests
 *
 * Tests for Companion protocol connection and frame handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server, Socket } from 'net';
import { CompanionConnection, FrameType, HEADER_LENGTH } from '../../src/protocol/connection.js';

describe('CompanionConnection', () => {
  let server: Server;
  let serverPort: number;
  let serverSocket: Socket | null = null;

  beforeEach(async () => {
    // Create a test server
    server = createServer((socket) => {
      serverSocket = socket;
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    if (serverSocket) {
      serverSocket.destroy();
      serverSocket = null;
    }
    server.close();
  });

  it('should connect to server', async () => {
    const conn = new CompanionConnection('127.0.0.1', serverPort);
    await conn.connect();
    expect(conn.connected).toBe(true);
    conn.close();
  });

  it('should send frame to server', async () => {
    const conn = new CompanionConnection('127.0.0.1', serverPort);
    await conn.connect();

    // Wait for server to receive connection
    await new Promise<void>((resolve) => {
      const check = () => {
        if (serverSocket) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    const receivedData = new Promise<Buffer>((resolve) => {
      serverSocket!.once('data', resolve);
    });

    const testData = Buffer.from([0x01, 0x02, 0x03]);
    conn.send(FrameType.E_OPACK, testData);

    const data = await receivedData;

    // Verify header
    expect(data[0]).toBe(FrameType.E_OPACK);
    expect(data.readUIntBE(1, 3)).toBe(testData.length);

    // Verify payload
    expect(data.subarray(HEADER_LENGTH)).toEqual(testData);

    conn.close();
  });

  it('should receive frame from server', async () => {
    const conn = new CompanionConnection('127.0.0.1', serverPort);
    await conn.connect();

    // Wait for server to receive connection
    await new Promise<void>((resolve) => {
      const check = () => {
        if (serverSocket) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    const framePromise = new Promise<{ frameType: FrameType; data: Buffer }>((resolve) => {
      conn.once('frame', (frameType, data) => {
        resolve({ frameType, data });
      });
    });

    // Send frame from server
    const testData = Buffer.from([0x04, 0x05, 0x06]);
    const header = Buffer.alloc(HEADER_LENGTH);
    header[0] = FrameType.U_OPACK;
    header.writeUIntBE(testData.length, 1, 3);
    serverSocket!.write(Buffer.concat([header, testData]));

    const { frameType, data } = await framePromise;
    expect(frameType).toBe(FrameType.U_OPACK);
    expect(data).toEqual(testData);

    conn.close();
  });

  it('should handle partial frames', async () => {
    const conn = new CompanionConnection('127.0.0.1', serverPort);
    await conn.connect();

    // Wait for server to receive connection
    await new Promise<void>((resolve) => {
      const check = () => {
        if (serverSocket) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    const framePromise = new Promise<{ frameType: FrameType; data: Buffer }>((resolve) => {
      conn.once('frame', (frameType, data) => {
        resolve({ frameType, data });
      });
    });

    // Send frame in parts
    const testData = Buffer.from([0x07, 0x08, 0x09, 0x0a]);
    const header = Buffer.alloc(HEADER_LENGTH);
    header[0] = FrameType.P_OPACK;
    header.writeUIntBE(testData.length, 1, 3);

    // Send header first
    serverSocket!.write(header);

    // Wait a bit, then send payload
    await new Promise((r) => setTimeout(r, 10));
    serverSocket!.write(testData);

    const { frameType, data } = await framePromise;
    expect(frameType).toBe(FrameType.P_OPACK);
    expect(data).toEqual(testData);

    conn.close();
  });

  it('should handle multiple frames in one packet', async () => {
    const conn = new CompanionConnection('127.0.0.1', serverPort);
    await conn.connect();

    // Wait for server to receive connection
    await new Promise<void>((resolve) => {
      const check = () => {
        if (serverSocket) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    const frames: Array<{ frameType: FrameType; data: Buffer }> = [];
    const framePromise = new Promise<void>((resolve) => {
      conn.on('frame', (frameType, data) => {
        frames.push({ frameType, data });
        if (frames.length === 2) resolve();
      });
    });

    // Build two frames
    const data1 = Buffer.from([0x01]);
    const header1 = Buffer.alloc(HEADER_LENGTH);
    header1[0] = FrameType.NoOp;
    header1.writeUIntBE(data1.length, 1, 3);

    const data2 = Buffer.from([0x02, 0x03]);
    const header2 = Buffer.alloc(HEADER_LENGTH);
    header2[0] = FrameType.E_OPACK;
    header2.writeUIntBE(data2.length, 1, 3);

    // Send both frames at once
    serverSocket!.write(Buffer.concat([header1, data1, header2, data2]));

    await framePromise;

    expect(frames.length).toBe(2);
    expect(frames[0].frameType).toBe(FrameType.NoOp);
    expect(frames[0].data).toEqual(data1);
    expect(frames[1].frameType).toBe(FrameType.E_OPACK);
    expect(frames[1].data).toEqual(data2);

    conn.close();
  });

  it('should emit disconnected event on close', async () => {
    const conn = new CompanionConnection('127.0.0.1', serverPort);
    await conn.connect();

    const disconnectedPromise = new Promise<void>((resolve) => {
      conn.once('disconnected', () => resolve());
    });

    conn.close();

    await disconnectedPromise;
    expect(conn.connected).toBe(false);
  });
});
