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
    const socket = async (userId: string) => {
      const s = io(base, {
        path: '/api/v1/chat/socket.io/',
        transports: ['websocket'],
        auth: { token: tokens.get(userId) ?? token(userId) },
        reconnection: false,
      });
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.once('connect', resolve);
        s.once('connect_error', reject);
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
      const authority = new AuthorityClient(
        {
          secret: 'test',
          bidding: 'http://bid',
          order: 'http://order',
          auth: 'http://auth',
          media: 'http://media',
        },
        async (url,init) => {
          const path = String(url);
          if(path.includes('/media/')){
            const body=JSON.parse(String(init?.body));
            if(!['chat/image','chat/video'].includes(body.storageKey))return new Response('{}',{status:404});
            return new Response(JSON.stringify({data:{storageKey:body.storageKey,ownerId:customer,verified:true,ready:true,private:true,mediaType:body.storageKey==='chat/image'?'IMAGE':'VIDEO',mimeType:body.storageKey==='chat/image'?'image/jpeg':'video/mp4',sizeBytes:100,width:100,height:100,durationMs:body.storageKey==='chat/image'?null:1000,url:'https://private.test/signed',urlExpiresAt:new Date(Date.now()+300000).toISOString()}}));
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
      const received = new Promise<any>((resolve) =>
        b.once('message.new', resolve),
      );
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
    it('typing expires and lifecycle denial applies to already joined sockets while history remains', async () => {
      const a = sockets[0]!,
        b = sockets[1]!;
      const typing = new Promise<any>((resolve) =>
        b.once('typing.update', resolve),
      );
      expect(
        (await ack(a, 'typing.start', { conversationId: conversation })).ok,
      ).toBe(true);
      expect((await typing).isTyping).toBe(true);
      const stopped=new Promise<any>(resolve=>b.once('typing.update',resolve));
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
    },10000);
    it('rejects revoked sessions on existing socket', async () => {
      active = false;
      expect(
        (
          await ack(sockets[0]!, 'conversation.join', {
            conversationId: conversation,
          })
        ).error.code,
      ).toBe('UNAUTHORIZED');
    });
  },
);
