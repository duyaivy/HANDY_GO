import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../../../libs/auth/src/auth.constants.js';
import { io, type Socket } from 'socket.io-client';
import { createMessageApp } from '../src/application.js';
import { MessagePrisma } from '../src/persistence.js';
import { AuthorityClient } from '../src/authority.js';

function nextEvent(
  socket: Socket,
  event: string,
  matches: (value: any) => boolean = () => true,
  timeoutMs = 3000,
): Promise<any> {
  const result = new Promise<any>((resolve, reject) => {
    const listener = (value: any) => {
      if (!matches(value)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    socket.on(event, listener);
  });
  // An ACK may fail before its already registered event is awaited.
  void result.catch(() => {});
  return result;
}

describe.runIf(process.env.MESSAGE_TEST_DATABASE_URL)(
  'real PostgreSQL REST and Socket.IO runtime',
  () => {
    const customer = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID(),
      bid = randomUUID(),
      request = randomUUID();
    let active = true,
      bidStatus = 'active',
      selected: string | null = null;
    let app: Awaited<ReturnType<typeof createMessageApp>>,
      db: MessagePrisma,
      base: string,
      conversation: string,
      firstMessage: string;
    let authority: AuthorityClient;
    const sockets: Socket[] = [];
    const jwt = new JwtService();
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = (userId: string) =>
      jwt.sign(
        {
          sub: randomUUID(),
          userId,
          sid: randomUUID(),
          roles: [],
          permissions: [],
          tokenType: 'access',
        },
        {
          privateKey: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }),
          algorithm: 'RS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: 300,
        },
      );
    const tokens = new Map<string, string>();
    const http = async (
      userId: string,
      path: string,
      method = 'GET',
      body?: unknown,
    ): Promise<{ status: number; data: any; code?: string }> => {
      if (!tokens.has(userId)) tokens.set(userId, token(userId));
      const response = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${tokens.get(userId)}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        ...((await response.json()) as { data: any; code?: string }),
      };
    };
    const client = (accessToken: string) => {
      const s = io(base, {
        path: '/api/v1/chat/socket.io/',
        transports: ['websocket'],
        auth: { token: accessToken },
        autoConnect: false,
        timeout: 2000,
        reconnection: false,
      });
      sockets.push(s);
      return s;
    };
    const socket = async (userId: string) => {
      const s = client(tokens.get(userId) ?? token(userId));
      await new Promise<void>((resolve, reject) => {
        const connected = () => {
          s.off('connect_error', failed);
          resolve();
        };
        const failed = (error: Error) => {
          s.off('connect', connected);
          s.disconnect();
          reject(error);
        };
        s.once('connect', connected);
        s.once('connect_error', failed);
        s.connect();
      });
      return s;
    };
    const ack = (s: Socket, event: string, payload: unknown): Promise<any> =>
      s.timeout(5000).emitWithAck(event, payload);
    beforeAll(async () => {
      process.env.JWT_PUBLIC_KEY = keys.publicKey
        .export({ format: 'pem', type: 'spki' })
        .toString();
      db = new MessagePrisma(process.env.MESSAGE_TEST_DATABASE_URL!);
      await db.$connect();
      authority = new AuthorityClient(
        {
          secret: 'test',
          bidding: 'http://bid',
          order: 'http://order',
          auth: 'http://auth',
          media: 'http://media',
        },
        async (url, init) => {
          const path = String(url);
          if (path.includes('/media/')) {
            const body = JSON.parse(String(init?.body));
            if (!['chat/image', 'chat/video'].includes(body.storageKey))
              return new Response('{}', { status: 404 });
            return new Response(
              JSON.stringify({
                data: {
                  storageKey: body.storageKey,
                  ownerId: customer,
                  verified: true,
                  ready: true,
                  private: true,
                  mediaType:
                    body.storageKey === 'chat/image' ? 'IMAGE' : 'VIDEO',
                  mimeType:
                    body.storageKey === 'chat/image'
                      ? 'image/jpeg'
                      : 'video/mp4',
                  sizeBytes: 100,
                  width: 100,
                  height: 100,
                  durationMs: body.storageKey === 'chat/image' ? null : 1000,
                  url: 'https://private.test/signed',
                  urlExpiresAt: new Date(Date.now() + 300000).toISOString(),
                },
              }),
            );
          }
          const data = path.includes('/chat-session')
            ? { active }
            : path.includes('/bids/')
              ? {
                  bidId: bid,
                  requestId: request,
                  workerId: worker,
                  status: bidStatus,
                  eligible: bidStatus === 'active',
                  validUntil: null,
                  roundStatus: 'open',
                  version: 1,
                  submittedAt: new Date().toISOString(),
                  verifiedAt: new Date().toISOString(),
                }
              : {
                  requestId: request,
                  customerId: customer,
                  status: selected ? 'converted_to_order' : 'open_for_bidding',
                  order: selected
                    ? {
                        orderId: randomUUID(),
                        workerId: selected,
                        status: 'created',
                        version: 1,
                        completedAt: null,
                      }
                    : null,
                  version: 1,
                  verifiedAt: new Date().toISOString(),
                };
          return new Response(JSON.stringify({ data }));
        },
      );
      app = await createMessageApp({
        db,
        authority,
        verifier: new TokenVerifierService(jwt),
        cursorSecret: 't'.repeat(32),
        origins: [],
      });
      await app.listen(0, '127.0.0.1');
      base = await app.getUrl();
    });
    afterAll(async () => {
      sockets.forEach((s) => s.disconnect());
      await app?.close();
      await db?.$disconnect();
    });
    it('denies before bidding and denies spoofed HTTP identity', async () => {
      bidStatus = 'withdrawn';
      expect(
        (await http(worker, '/conversations', 'POST', { bidId: bid })).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${base}/api/v1/conversations`, {
            headers: { 'x-user-id': customer },
          })
        ).status,
      ).toBe(401);
      bidStatus = 'active';
    });
    it('creates once under concurrent creates and isolates other workers', async () => {
      const results = await Promise.all([
        http(customer, '/conversations', 'POST', { bidId: bid }),
        http(worker, '/conversations', 'POST', { bidId: bid }),
      ]);
      conversation = results[0]!.data.id;
      expect(results[1]!.data.id).toBe(conversation);
      expect(
        (await http(outsider, `/conversations/${conversation}`)).status,
      ).toBe(404);
    });
    it('commits one message/outbox and returns same persisted ACK under concurrent retries', async () => {
      const a = await socket(customer),
        b = await socket(worker),
        stranger = await socket(outsider);
      expect(
        (
          await ack(stranger, 'conversation.join', {
            conversationId: conversation,
          })
        ).error.code,
      ).toBe('CONVERSATION_NOT_FOUND');
      await ack(b, 'conversation.join', { conversationId: conversation });
      const received = nextEvent(b, 'message.new');
      const payload = {
        conversationId: conversation,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Tôi sẽ đến vào buổi sáng',
      };
      const results = await Promise.all([
        ack(a, 'message.send', payload),
        ack(a, 'message.send', payload),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
      expect(results[0].data.message.id).toBe(results[1].data.message.id);
      firstMessage = results[0].data.message.id;
      expect((await received).id).toBe(firstMessage);
      expect(await db.message.count()).toBe(1);
      expect(await db.outboxEvent.count()).toBe(1);
      const event = (await db.outboxEvent.findFirstOrThrow()).payload as any;
      expect(event.data.sequence).toBe(results[0].data.message.sequence);
      expect(BigInt(event.data.sequence)).toBeGreaterThan(0n);
      expect(event.occurredAt).toBe(results[0].data.message.createdAt);
      expect(
        (await ack(a, 'message.send', { ...payload, content: 'different' }))
          .error.code,
      ).toBe('IDEMPOTENCY_CONFLICT');
      expect(
        (await ack(a, 'message.send', { ...payload, senderId: outsider })).error
          .code,
      ).toBe('VALIDATION_ERROR');
    });
    it('persists replies, rejects foreign target, and recovers history after sequence', async () => {
      const s = sockets[0]!;
      const payload = {
        conversationId: conversation,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Vâng',
        replyToId: firstMessage,
      };
      const reply = await ack(s, 'message.send', payload);
      expect(reply.data.message.reply.id).toBe(firstMessage);
      expect(
        (
          await ack(s, 'message.send', {
            ...payload,
            clientMessageId: randomUUID(),
            replyToId: randomUUID(),
          })
        ).error.code,
      ).toBe('REPLY_NOT_FOUND');
      const history = await http(
        worker,
        `/conversations/${conversation}/messages?afterSequence=1`,
      );
      expect(history.data.items).toHaveLength(1);
      expect(history.data.highWaterSequence).toBe('2');
    });
    it('advances only own monotonic read cursor and rejects future cursor', async () => {
      expect(
        (
          await http(worker, `/conversations/${conversation}/read`, 'PATCH', {
            lastReadSequence: '2',
          })
        ).data.lastReadSequence,
      ).toBe('2');
      expect(
        (
          await http(worker, `/conversations/${conversation}/read`, 'PATCH', {
            lastReadSequence: '1',
          })
        ).data.lastReadSequence,
      ).toBe('2');
      expect(
        (
          await http(worker, `/conversations/${conversation}/read`, 'PATCH', {
            lastReadSequence: '99',
          })
        ).status,
      ).toBe(400);
    });
    it('rejects an invalid admission token with the public Socket.IO error data', async () => {
      const s = client('invalid.access.token');
      try {
        const rejected = nextEvent(s, 'connect_error');
        s.connect();
        const error = await rejected;
        expect(error.message).toBe('Unauthorized');
        expect(error.data).toEqual({ code: 'UNAUTHORIZED', retryable: false });
        expect(s.connected).toBe(false);
      } finally {
        s.disconnect();
      }
    });
    it('does not persist, advance read state, or start typing for events without ACKs', async () => {
      const sender = await socket(customer),
        observer = await socket(worker);
      const received: unknown[] = [];
      const collect = (value: unknown) => received.push(value);
      try {
        expect(
          (
            await ack(observer, 'conversation.join', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        observer.on('message.new', collect);
        observer.on('message.read.updated', collect);
        observer.on('typing.update', collect);
        const clientMessageId = randomUUID();
        const readBefore = await db.conversationReadState.findUnique({
          where: {
            conversationId_userId: {
              conversationId: conversation,
              userId: customer,
            },
          },
        });
        const outboxBefore = await db.outboxEvent.count();
        sender.emit('message.send', {
          conversationId: conversation,
          clientMessageId,
          messageType: 'TEXT',
          content: 'An unacknowledged message must not be stored',
        });
        sender.emit('message.read', {
          conversationId: conversation,
          lastReadSequence: '2',
        });
        sender.emit('typing.start', { conversationId: conversation });
        // A round trip proves the preceding packets reached the live server.
        expect(
          (
            await ack(sender, 'conversation.join', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(
          await db.message.findUnique({
            where: {
              senderId_clientMessageId: { senderId: customer, clientMessageId },
            },
          }),
        ).toBeNull();
        expect(await db.outboxEvent.count()).toBe(outboxBefore);
        expect(
          await db.conversationReadState.findUnique({
            where: {
              conversationId_userId: {
                conversationId: conversation,
                userId: customer,
              },
            },
          }),
        ).toEqual(readBefore);
        expect(received).toEqual([]);
      } finally {
        observer.off('message.new', collect);
        observer.off('message.read.updated', collect);
        observer.off('typing.update', collect);
        sender.disconnect();
        observer.disconnect();
      }
    });
    it('delivers typing only to other users in the room and stops delivery after leave', async () => {
      const firstDevice = await socket(customer),
        secondDevice = await socket(customer),
        observer = await socket(worker),
        unjoined = await socket(worker);
      const observerUpdates: any[] = [],
        unjoinedUpdates: any[] = [],
        selfUpdates: any[] = [];
      const collectObserver = (value: any) => observerUpdates.push(value);
      const collectUnjoined = (value: any) => unjoinedUpdates.push(value);
      const collectSelf = (value: any) => selfUpdates.push(value);
      try {
        for (const s of [observer, firstDevice, secondDevice])
          expect(
            (
              await ack(s, 'conversation.join', {
                conversationId: conversation,
              })
            ).ok,
          ).toBe(true);
        observer.on('typing.update', collectObserver);
        unjoined.on('typing.update', collectUnjoined);
        firstDevice.on('typing.update', collectSelf);
        secondDevice.on('typing.update', collectSelf);
        const started = nextEvent(observer, 'typing.update');
        expect(
          (
            await ack(firstDevice, 'typing.start', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        expect(await started).toMatchObject({
          conversationId: conversation,
          userId: customer,
          isTyping: true,
        });
        observerUpdates.length = 0;
        expect(
          await ack(observer, 'conversation.leave', {
            conversationId: conversation,
          }),
        ).toEqual({
          ok: true,
          data: { conversationId: conversation },
        });
        // The original joined worker remains a positive delivery control.
        const stopped = nextEvent(
          sockets[1]!,
          'typing.update',
          (value) => !value.isTyping,
        );
        expect(
          (
            await ack(firstDevice, 'typing.stop', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        await stopped;
        const restarted = nextEvent(
          sockets[1]!,
          'typing.update',
          (value) => value.isTyping,
        );
        expect(
          (
            await ack(secondDevice, 'typing.start', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        await restarted;
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(observerUpdates).toEqual([]);
        expect(unjoinedUpdates).toEqual([]);
        expect(selfUpdates).toEqual([]);
        expect(
          (
            await ack(observer, 'conversation.join', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        const rejoined = nextEvent(observer, 'typing.update');
        expect(
          (
            await ack(secondDevice, 'typing.stop', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        expect(await rejoined).toMatchObject({
          conversationId: conversation,
          userId: customer,
          isTyping: false,
        });
      } finally {
        observer.off('typing.update', collectObserver);
        unjoined.off('typing.update', collectUnjoined);
        firstDevice.off('typing.update', collectSelf);
        secondDevice.off('typing.update', collectSelf);
        for (const s of [firstDevice, secondDevice, observer, unjoined])
          s.disconnect();
      }
    });
    it('keeps typing active for another device and clears it when the last device disconnects', async () => {
      const firstDevice = await socket(customer),
        secondDevice = await socket(customer),
        observer = await socket(worker);
      try {
        expect(
          (
            await ack(observer, 'conversation.join', {
              conversationId: conversation,
            })
          ).ok,
        ).toBe(true);
        for (const s of [firstDevice, secondDevice]) {
          const started = nextEvent(observer, 'typing.update');
          expect(
            (await ack(s, 'typing.start', { conversationId: conversation })).ok,
          ).toBe(true);
          expect(await started).toMatchObject({
            conversationId: conversation,
            userId: customer,
            isTyping: true,
          });
        }
        const stillTyping = nextEvent(observer, 'typing.update');
        firstDevice.disconnect();
        expect(await stillTyping).toMatchObject({
          conversationId: conversation,
          userId: customer,
          isTyping: true,
        });
        const stopped = nextEvent(observer, 'typing.update');
        secondDevice.disconnect();
        expect(await stopped).toMatchObject({
          conversationId: conversation,
          userId: customer,
          isTyping: false,
        });
      } finally {
        for (const s of [firstDevice, secondDevice, observer]) s.disconnect();
      }
    });
    it('returns the public HTTP error envelope for unauthorized, malformed, and missing conversations', async () => {
      const unauthenticated = await fetch(`${base}/api/v1/conversations`);
      expect(unauthenticated.status).toBe(401);
      expect(await unauthenticated.json()).toEqual({
        statusCode: 401,
        message: 'UNAUTHORIZED',
        data: null,
        code: 'UNAUTHORIZED',
      });
      for (const [userId, path, status, code] of [
        [customer, '/conversations?limit=0', 400, 'VALIDATION_ERROR'],
        [
          outsider,
          `/conversations/${conversation}`,
          404,
          'CONVERSATION_NOT_FOUND',
        ],
      ] as const) {
        expect(await http(userId, path)).toEqual({
          status,
          statusCode: status,
          message: code,
          data: null,
          code,
        });
      }
    });
    it('rejects HTTP JSON bodies above 16 KiB with the public payload-too-large envelope', async () => {
      const before = await db.conversation.count();
      const response = await http(customer, '/conversations', 'POST', {
        bidId: bid,
        padding: 'x'.repeat(16384),
      });
      expect(response).toEqual({
        status: 413,
        statusCode: 413,
        message: 'PAYLOAD_TOO_LARGE',
        data: null,
        code: 'PAYLOAD_TOO_LARGE',
      });
      expect(await db.conversation.count()).toBe(before);
    });
    it('typing expires and lifecycle denial applies to already joined sockets while history remains', async () => {
      const a = sockets[0]!,
        b = sockets[1]!;
      const typing = nextEvent(b, 'typing.update');
      expect(
        (await ack(a, 'typing.start', { conversationId: conversation })).ok,
      ).toBe(true);
      expect((await typing).isTyping).toBe(true);
      const stopped = nextEvent(
        b,
        'typing.update',
        (value) => !value.isTyping,
        7000,
      );
      expect((await stopped).isTyping).toBe(false);
      bidStatus = 'withdrawn';
      expect(
        (
          await ack(a, 'message.send', {
            conversationId: conversation,
            clientMessageId: randomUUID(),
            messageType: 'TEXT',
            content: 'late',
          })
        ).error.code,
      ).toBe('CHAT_READ_ONLY');
      expect(
        (await ack(a, 'typing.start', { conversationId: conversation })).error
          .code,
      ).toBe('CHAT_READ_ONLY');
      expect(
        (await http(customer, `/conversations/${conversation}/messages`)).data
          .items,
      ).toHaveLength(2);
    }, 10000);
    it('rejects revoked sessions on existing socket', async () => {
      active = false;
      // Expire the session cache without changing Socket.IO transport clocks.
      const cache = (
        authority as unknown as {
          activeCache: Map<string, { expiresAt: number }>;
        }
      ).activeCache;
      for (const entry of cache.values()) entry.expiresAt = 0;
      const disconnected = nextEvent(sockets[0]!, 'disconnect');
      expect(
        (
          await ack(sockets[0]!, 'conversation.join', {
            conversationId: conversation,
          })
        ).error.code,
      ).toBe('UNAUTHORIZED');
      expect(await disconnected).toBe('io server disconnect');
      expect(sockets[0]!.connected).toBe(false);
    });
  },
);
