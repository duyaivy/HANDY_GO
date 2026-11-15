import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { MessageRealtime } from './realtime.js';
import { RateLimits } from './security.js';

describe('Socket.IO admission and early rate limits', () => {
  let realtime: MessageRealtime, base: string, identity: any, messages: any;
  const sockets: Socket[] = [];
  const userId = randomUUID(),
    conversationId = randomUUID();
  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    identity = {
      authenticate: vi.fn(async () => ({
        userId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })),
    };
    messages = {
      db: {
        conversation: {
          findUnique: vi.fn(async () => ({
            id: conversationId,
            customerId: userId,
            workerId: randomUUID(),
          })),
        },
      },
      permission: vi.fn(async () => ({})),
      get: vi.fn(async () => ({ id: conversationId })),
      send: vi.fn(async () => ({ message: {} })),
      read: vi.fn(async () => ({})),
    };
    const server = createServer();
    realtime = new MessageRealtime(
      server,
      identity,
      messages,
      new RateLimits(),
      [],
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await realtime.close();
    vi.restoreAllMocks();
  });
  function connect(token = 'token') {
    const socket = io(base, {
      path: '/api/v1/chat/socket.io/',
      transports: ['websocket'],
      auth: { token },
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise<{ socket: Socket; ok: boolean; error?: any }>((resolve) => {
      socket.once('connect', () => resolve({ socket, ok: true }));
      socket.once('connect_error', (error) => resolve({ socket, ok: false, error }));
    });
  }
  const ack = (
    socket: Socket,
    event: string,
    input = { conversationId },
  ): Promise<any> => socket.timeout(2000).emitWithAck(event, input);

  it('counts pending handshakes atomically and releases capacity on disconnect', async () => {
    // Delay a later admission step so all checks run before any connection handler.
    realtime.io.use((_socket, next) => setTimeout(next, 50));
    const results = await Promise.all(Array.from({ length: 20 }, connect));
    const successful = results.filter((result) => result.ok);
    const rejected = results.filter((result) => !result.ok);
    expect(successful).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) {
      expect(r.error.message).toBe('Rate limited');
      expect(r.error.data).toEqual({ code: 'RATE_LIMITED', retryable: true });
    }
    results.forEach(({ socket }) => socket.disconnect());
    await vi.waitFor(() => expect(realtime.io.engine.clientsCount).toBe(0));
    expect((await connect()).ok).toBe(true);
  });

  it('rejects handshake with UNAUTHORIZED when JWT authentication fails', async () => {
    identity.authenticate.mockRejectedValueOnce(new Error('Invalid token'));
    const { ok, error } = await connect('bad-jwt');
    expect(ok).toBe(false);
    expect(error.message).toBe('Unauthorized');
    expect(error.data).toEqual({ code: 'UNAUTHORIZED', retryable: false });
  });

  it('rejects handshake with RATE_LIMITED when exceeding 10 concurrent sockets and recovers slot on disconnect', async () => {
    const active = [];
    for (let i = 0; i < 10; i++) {
      const res = await connect();
      expect(res.ok).toBe(true);
      active.push(res);
    }

    // 11th socket exceeds limit
    const excess = await connect();
    expect(excess.ok).toBe(false);
    expect(excess.error.message).toBe('Rate limited');
    expect(excess.error.data).toEqual({ code: 'RATE_LIMITED', retryable: true });

    // Disconnect one socket
    active[0].socket.disconnect();
    await vi.waitFor(() => expect(realtime.io.engine.clientsCount).toBe(9));

    // Next connection succeeds
    const recovered = await connect();
    expect(recovered.ok).toBe(true);
  });

  it('releases reservations for clients that abandon a pending handshake', async () => {
    let entered = 0;
    realtime.io.use((_socket, next) => {
      entered++;
      setTimeout(next, 100);
    });
    const pending = Array.from({ length: 10 }, connect);
    await vi.waitFor(() => expect(entered).toBe(10));
    sockets.forEach((socket) => socket.disconnect());
    await vi.waitFor(() => expect(realtime.io.engine.clientsCount).toBe(0));
    expect((await connect()).ok).toBe(true);
    // Abandoned client promises intentionally have no connection outcome.
    void pending;
  });

  it.each(['typing.start', 'typing.stop'])(
    'limits %s before authentication, DB and authority calls',
    async (event) => {
      const { socket } = await connect();
      let result: any;
      for (let i = 0; i < 5; i++) {
        result = await ack(socket, event);
        if (!result.ok) break;
      }
      expect(result.error.code).toBe('RATE_LIMITED');
      const calls = [
        identity.authenticate.mock.calls.length,
        messages.db.conversation.findUnique.mock.calls.length,
        messages.permission.mock.calls.length,
      ];
      expect((await ack(socket, event)).error.code).toBe('RATE_LIMITED');
      expect([
        identity.authenticate.mock.calls.length,
        messages.db.conversation.findUnique.mock.calls.length,
        messages.permission.mock.calls.length,
      ]).toEqual(calls);
    },
  );

  it('releases reservations after a later admission rejection', async () => {
    let reject = true;
    realtime.io.use((_socket, next) =>
      next(reject ? new Error('Rejected') : undefined),
    );
    const results = await Promise.all(Array.from({ length: 10 }, connect));
    expect(results.every((result) => !result.ok)).toBe(true);
    await vi.waitFor(() => expect(realtime.io.engine.clientsCount).toBe(0));
    reject = false;
    expect((await connect()).ok).toBe(true);
  });

  it('releases reservations when pending admission times out', async () => {
    let entered = 0,
      hold = true;
    realtime.io.connectTimeout(200);
    realtime.io.use((_socket, next) => {
      entered++;
      if (!hold) next();
    });
    void Array.from({ length: 10 }, connect);
    await vi.waitFor(() => expect(entered).toBe(10));
    await vi.waitFor(() => expect(realtime.io.engine.clientsCount).toBe(0));
    hold = false;
    expect((await connect()).ok).toBe(true);
  });

  it('bounds a socket rotating conversations and a user rotating sockets', async () => {
    const connected = await Promise.all(Array.from({ length: 4 }, connect));
    for (let s = 0; s < connected.length; s++) {
      for (let i = 0; i < 40; i++) {
        const result = await ack(connected[s].socket, 'typing.stop', {
          conversationId: randomUUID(),
        });
        if (!result.ok) break;
      }
    }
    const calls = identity.authenticate.mock.calls.length;
    expect(
      (
        await ack(connected[3].socket, 'typing.stop', {
          conversationId: randomUUID(),
        })
      ).error.code,
    ).toBe('RATE_LIMITED');
    expect(identity.authenticate).toHaveBeenCalledTimes(calls);
    expect(messages.permission.mock.calls.length).toBeLessThanOrEqual(120);
  });

  it('bounds one socket even when every typing event targets a different conversation', async () => {
    const { socket } = await connect();
    for (let i = 0; i < 40; i++)
      expect(
        (await ack(socket, 'typing.stop', { conversationId: randomUUID() })).ok,
      ).toBe(true);
    const calls = identity.authenticate.mock.calls.length;
    expect(
      (await ack(socket, 'typing.stop', { conversationId: randomUUID() })).error
        .code,
    ).toBe('RATE_LIMITED');
    expect(identity.authenticate).toHaveBeenCalledTimes(calls);
  });

  it.each([
    'conversation.join',
    'conversation.leave',
    'message.read',
    'message.send',
  ])(
    'limits %s before re-authentication and application work',
    async (event) => {
      const { socket } = await connect();
      const input =
        event === 'message.send'
          ? {
              conversationId,
              clientMessageId: randomUUID(),
              messageType: 'TEXT',
              content: 'Hello',
            }
          : event === 'message.read'
            ? { conversationId, lastReadSequence: '0' }
            : { conversationId };
      for (let i = 0; i < (event === 'message.send' ? 20 : 120); i++)
        expect((await ack(socket, event, input)).ok).toBe(true);
      const calls = identity.authenticate.mock.calls.length;
      expect((await ack(socket, event, input)).error.code).toBe('RATE_LIMITED');
      expect(identity.authenticate).toHaveBeenCalledTimes(calls);
    },
  );

  it('allows start followed immediately by stop', async () => {
    const { socket } = await connect();
    expect((await ack(socket, 'typing.start')).ok).toBe(true);
    expect((await ack(socket, 'typing.stop')).ok).toBe(true);
  });
});
