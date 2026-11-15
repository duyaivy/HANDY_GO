import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Conversation, Message, MessageAttachment } from '@prisma/message-client';
import { MessageService } from './message.service.js';
import { AuthorityClient } from './authority.js';
import { CursorCodec, ChatError } from './security.js';
import type { MessagePrisma } from './persistence.js';
import type { MessageSendInput } from '../../../libs/common/src/message-contracts/index.js';

describe('Message Service Latency & Idempotency Optimizations', () => {
  const customerId = randomUUID();
  const workerId = randomUUID();
  const requestId = randomUUID();
  const conversationId = randomUUID();
  const bidId = randomUUID();

  let conv: Conversation;
  let dbMessages: Map<string, any>;
  let outboxEvents: any[];
  let queryRawCalls: any[];
  let db: any;
  let authority: AuthorityClient;
  let service: MessageService;
  let authorityFetch: any;

  beforeEach(() => {
    conv = {
      id: conversationId,
      requestId,
      orderId: null,
      customerId,
      workerId,
      status: 'OPEN',
      lastSequence: 10n,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dbMessages = new Map();
    outboxEvents = [];
    queryRawCalls = [];

    db = {
      conversation: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.id === conv.id) return { ...conv };
          return null;
        }),
        update: vi.fn(async ({ where, data }) => {
          Object.assign(conv, data);
          return { ...conv };
        }),
        findMany: vi.fn(async () => [{ ...conv }]),
        updateMany: vi.fn(async ({ data }) => {
          Object.assign(conv, data);
          return { count: 1 };
        }),
      },
      message: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.senderId_clientMessageId) {
            const key = `${where.senderId_clientMessageId.senderId}:${where.senderId_clientMessageId.clientMessageId}`;
            return dbMessages.get(key) ?? null;
          }
          if (where.conversationId_id) {
            for (const m of dbMessages.values()) {
              if (m.id === where.conversationId_id.id && m.conversationId === where.conversationId_id.conversationId)
                return m;
            }
          }
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const key = `${data.senderId}:${data.clientMessageId}`;
          if (dbMessages.has(key)) {
            const err = new Error('Unique constraint failed') as any;
            err.code = 'P2002';
            err.meta = { target: ['sender_id', 'client_message_id'] };
            throw err;
          }
          const row = {
            id: randomUUID(),
            ...data,
            sequence: ++conv.lastSequence,
            createdAt: new Date(),
            attachments: [],
            replyTo: null,
          };
          dbMessages.set(key, row);
          return row;
        }),
      },
      outboxEvent: {
        create: vi.fn(async ({ data }) => {
          outboxEvents.push(data);
          return data;
        }),
      },
      consumedEvent: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => data),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
        queryRawCalls.push({ strings, values });
        const payloadJson = values.find(
          (v) => typeof v === 'string' && v.startsWith('{"eventId":'),
        );
        const eventId = values.find(
          (v) =>
            typeof v === 'string' &&
            v.length === 36 &&
            v !== customerId &&
            v !== workerId &&
            v !== conversationId,
        );
        const content = values.find(
          (v) =>
            typeof v === 'string' &&
            !v.startsWith('{"eventId":') &&
            v.length !== 36 &&
            v !== 'TEXT',
        );
        const clientMessageId = values.find(
          (v) =>
            typeof v === 'string' &&
            v.length === 36 &&
            v !== customerId &&
            v !== workerId &&
            v !== conversationId &&
            v !== eventId,
        );

        let replyToId: string | null = null;
        for (const v of values) {
          if (v && typeof v === 'object' && 'values' in v && Array.isArray(v.values) && v.values.length > 0) {
            if (typeof v.values[0] === 'string' && v.values[0].length === 36) {
              replyToId = v.values[0];
              break;
            }
          }
        }

        const msgPayload = payloadJson ? JSON.parse(payloadJson) : null;
        const msgId = msgPayload?.data?.messageId ?? randomUUID();
        const key = `${customerId}:${clientMessageId}`;

        if (dbMessages.has(key)) {
          const err = new Error(
            'duplicate key value violates unique constraint',
          ) as any;
          err.code = '23505';
          err.constraint = 'messages_sender_id_client_message_id_key';
          throw err;
        }

        if (replyToId && replyToId !== 'valid-reply-id') {
          const err = new Error('foreign key constraint violated') as any;
          err.code = '23503';
          err.constraint = 'messages_conversation_id_reply_to_id_fkey';
          throw err;
        }

        const newSeq = ++conv.lastSequence;
        const rawRow = {
          id: msgId,
          conversation_id: conv.id,
          sender_id: customerId,
          client_message_id: clientMessageId,
          message_type: 'TEXT',
          content,
          reply_to_id: replyToId,
          sequence: newSeq,
          created_at: new Date(),
          reply_id: replyToId === 'valid-reply-id' ? 'valid-reply-id' : null,
          reply_conversation_id: replyToId === 'valid-reply-id' ? conv.id : null,
          reply_sender_id: replyToId === 'valid-reply-id' ? workerId : null,
          reply_client_message_id: replyToId === 'valid-reply-id' ? randomUUID() : null,
          reply_message_type: replyToId === 'valid-reply-id' ? 'TEXT' : null,
          reply_content: replyToId === 'valid-reply-id' ? 'Previous message' : null,
          reply_reply_to_id: null,
          reply_sequence: replyToId === 'valid-reply-id' ? 5n : null,
          reply_created_at: replyToId === 'valid-reply-id' ? new Date() : null,
        };

        dbMessages.set(key, {
          id: msgId,
          conversationId: conv.id,
          senderId: customerId,
          clientMessageId,
          messageType: 'TEXT',
          content,
          replyToId,
          sequence: newSeq,
          createdAt: rawRow.created_at,
          attachments: [],
          replyTo: rawRow.reply_id
            ? {
                id: rawRow.reply_id,
                conversationId: rawRow.reply_conversation_id,
                senderId: rawRow.reply_sender_id,
                clientMessageId: rawRow.reply_client_message_id,
                messageType: rawRow.reply_message_type,
                content: rawRow.reply_content,
                replyToId: null,
                sequence: rawRow.reply_sequence,
                createdAt: rawRow.reply_created_at,
              }
            : null,
        });

        // Outbox event was atomically inserted in CTE
        if (payloadJson) {
          outboxEvents.push({
            id: eventId,
            aggregateId: msgId,
            eventType: 'message.created',
            payload: JSON.parse(payloadJson),
          });
        }

        return [rawRow];
      }),
      $transaction: vi.fn(async (cb) => cb(db)),
    } as unknown as MessagePrisma;

    authorityFetch = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/chat-session')) {
        return new Response(JSON.stringify({ data: { active: true } }));
      }
      if (u.includes('/chat-lookup') || u.includes('/chat-eligibility')) {
        return new Response(
          JSON.stringify({
            data: {
              bidId,
              requestId,
              workerId,
              status: 'active',
              roundStatus: 'open',
              eligible: true,
              version: 1,
              submittedAt: new Date().toISOString(),
              validUntil: null,
              verifiedAt: new Date().toISOString(),
            },
          }),
        );
      }
      if (u.includes('/chat-state')) {
        return new Response(
          JSON.stringify({
            data: {
              requestId,
              customerId,
              status: 'open_for_bidding',
              version: 1,
              order: null,
              verifiedAt: new Date().toISOString(),
            },
          }),
        );
      }
      return new Response('{}', { status: 404 });
    });

    authority = new AuthorityClient(
      {
        secret: 'test-secret',
        bidding: 'http://bidding.test',
        order: 'http://order.test',
        auth: 'http://auth.test',
        media: 'http://media.test',
      },
      authorityFetch,
    );

    service = new MessageService(db, authority, new CursorCodec('k'.repeat(32)));
  });

  it('Scenario 1 & 7: Normal send measures structured latency and caches membership', async () => {
    const input: MessageSendInput = {
      conversationId,
      clientMessageId: randomUUID(),
      messageType: 'TEXT',
      content: 'Xin chào',
    };

    const res1 = await service.send(customerId, input);
    expect(res1.duplicate).toBe(false);
    expect(res1.message.content).toBe('Xin chào');
    expect(res1.message.sequence).toBe('11');
    expect(res1.timings).toBeDefined();
    expect(res1.timings!.membershipCheckMs).toBeGreaterThanOrEqual(0);
    expect(res1.timings!.dbTransactionMs).toBeGreaterThanOrEqual(0);
    expect(res1.timings!.totalAckMs).toBeGreaterThanOrEqual(0);
    expect(outboxEvents.length).toBe(1);

    // Second send: membership is served from in-memory memberCache (<1ms, 0 extra DB query)
    const input2: MessageSendInput = {
      conversationId,
      clientMessageId: randomUUID(),
      messageType: 'TEXT',
      content: 'Tin nhắn thứ 2',
    };
    (db.conversation.findUnique as any).mockClear();

    const res2 = await service.send(customerId, input2);
    expect(res2.duplicate).toBe(false);
    expect(res2.message.sequence).toBe('12');
    expect(db.conversation.findUnique).not.toHaveBeenCalled(); // Cached!
  });

  it('Scenario 2 & 4: Rapid retry after lost ACK returns duplicate in <1ms without DB query', async () => {
    const clientMessageId = randomUUID();
    const input: MessageSendInput = {
      conversationId,
      clientMessageId,
      messageType: 'TEXT',
      content: 'Tin nhắn cần gửi',
    };

    const res1 = await service.send(customerId, input);
    expect(res1.duplicate).toBe(false);

    // Simulated lost ACK -> Client retries with exact same payload and clientMessageId
    queryRawCalls.length = 0;
    const res2 = await service.send(customerId, input);
    expect(res2.duplicate).toBe(true);
    expect(res2.message.id).toBe(res1.message.id);
    expect(res2.message.sequence).toBe(res1.message.sequence);
    expect(queryRawCalls.length).toBe(0); // Zero DB calls!
  });

  it('Scenario 3: Unique constraint violation (23505/P2002) fallback handles race condition', async () => {
    const clientMessageId = randomUUID();
    const input: MessageSendInput = {
      conversationId,
      clientMessageId,
      messageType: 'TEXT',
      content: 'Concurrent send test',
    };

    // First send persists to DB
    const res1 = await service.send(customerId, input);

    // Evict from memory cache to simulate race condition between separate server instances
    (service as any).recentMessages.clear();

    // Second concurrent send hits DB unique constraint (23505), catches error, recovers winner
    const res2 = await service.send(customerId, input);
    expect(res2.duplicate).toBe(true);
    expect(res2.message.id).toBe(res1.message.id);
  });

  it('recovers an idempotent ACK from Prisma P2010 driver metadata', async () => {
    const input: MessageSendInput = {
      conversationId,
      clientMessageId: randomUUID(),
      messageType: 'TEXT',
      content: 'Retry',
    };
    const first = await service.send(customerId, input);
    (service as any).recentMessages.clear();
    db.$queryRaw.mockRejectedValueOnce({
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: '23505',
            kind: 'UniqueConstraintViolation',
            constraint: { index: 'messages_sender_id_client_message_id_key' },
          },
        },
      },
    });
    expect((await service.send(customerId, input)).message.id).toBe(
      first.message.id,
    );
  });

  it('does not recover unrelated raw unique constraints as idempotent success', async () => {
    const input: MessageSendInput = {
      conversationId,
      clientMessageId: randomUUID(),
      messageType: 'TEXT',
      content: 'Retry',
    };
    await service.send(customerId, input);
    (service as any).recentMessages.clear();
    const error = {
      code: 'P2010',
      meta: {
        code: '23505',
        message: 'constraint "messages_conversation_id_sequence_key"',
      },
    };
    db.$queryRaw.mockRejectedValueOnce(error);
    await expect(service.send(customerId, input)).rejects.toEqual(error);
  });

  it('refreshes expired media ACKs with read permission even after sending closes', async () => {
    const input: MessageSendInput = {
      conversationId,
      clientMessageId: randomUUID(),
      messageType: 'IMAGE',
      attachments: [{ storageKey: 'chat/image' }],
    };
    const raw = {
      id: randomUUID(),
      conversationId,
      senderId: customerId,
      clientMessageId: input.clientMessageId,
      messageType: 'IMAGE',
      content: null,
      replyToId: null,
      sequence: 10n,
      createdAt: new Date(),
      replyTo: null,
      attachments: [
        {
          id: randomUUID(),
          storageKey: 'chat/image',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          sizeBytes: 100n,
          position: 0,
          width: 10,
          height: 10,
          durationMs: null,
        },
      ],
    };
    const stale = {
      ...raw,
      sequence: '10',
      createdAt: raw.createdAt.toISOString(),
      attachments: [
        {
          ...raw.attachments[0],
          sizeBytes: 100,
          url: 'expired',
          urlExpiresAt: new Date(Date.now() - 1).toISOString(),
        },
      ],
    };
    (service as any).recentMessages.set(
      `${customerId}:${input.clientMessageId}`,
      { raw, message: stale, expiresAt: Date.now() - 1 },
    );
    conv.status = 'READ_ONLY';
    vi.spyOn(authority, 'media').mockResolvedValue({
      url: 'fresh',
      urlExpiresAt: new Date(Date.now() + 300000).toISOString(),
    } as any);
    const result = await service.send(customerId, input);
    expect(result.duplicate).toBe(true);
    expect(result.message.attachments[0].url).toBe('fresh');
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('Scenario 5: Conflict error thrown when same clientMessageId has different payload', async () => {
    const clientMessageId = randomUUID();
    await service.send(customerId, {
      conversationId,
      clientMessageId,
      messageType: 'TEXT',
      content: 'Original payload',
    });

    await expect(
      service.send(customerId, {
        conversationId,
        clientMessageId,
        messageType: 'TEXT',
        content: 'Tampered different payload',
      }),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('Scenario 6: Unauthorized sender is rejected with CONVERSATION_NOT_FOUND', async () => {
    const intruderId = randomUUID();
    await expect(
      service.send(intruderId, {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Intruder message',
      }),
    ).rejects.toThrow('CONVERSATION_NOT_FOUND');
  });

  it('Scenario 8: READ_ONLY conversation fails closed immediately without upstream calls', async () => {
    conv.status = 'READ_ONLY';
    (service as any).memberCache.clear();
    authorityFetch.mockClear();

    await expect(
      service.send(customerId, {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Late message',
      }),
    ).rejects.toThrow('CHAT_READ_ONLY');

    // No upstream calls made because conversation is already READ_ONLY!
    expect(authorityFetch).not.toHaveBeenCalled();
  });

  it('Scenario 9: Bidding authorization rejection denies send', async () => {
    authorityFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/chat-lookup')) {
        return new Response(
          JSON.stringify({
            data: {
              bidId,
              requestId,
              workerId,
              status: 'withdrawn', // Bid was withdrawn!
              roundStatus: 'open',
              eligible: false,
              version: 1,
              submittedAt: new Date().toISOString(),
              validUntil: null,
              verifiedAt: new Date().toISOString(),
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            requestId,
            customerId,
            status: 'open_for_bidding',
            version: 1,
            order: null,
            verifiedAt: new Date().toISOString(),
          },
        }),
      );
    });

    const unauthClient = new AuthorityClient(
      {
        secret: 'test-secret',
        bidding: 'http://bidding.test',
        order: 'http://order.test',
        auth: 'http://auth.test',
        media: 'http://media.test',
      },
      authorityFetch,
    );
    const unauthService = new MessageService(db, unauthClient, new CursorCodec('k'.repeat(32)));

    await expect(
      unauthService.send(customerId, {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Message with withdrawn bid',
      }),
    ).rejects.toThrow('CHAT_READ_ONLY');
  });

  it('Scenario 10: Upstream service timeout fails closed with ELIGIBILITY_UNAVAILABLE', async () => {
    const hangingFetch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 2500));
      return new Response('{}');
    });

    const timeoutClient = new AuthorityClient(
      {
        secret: 'test-secret',
        bidding: 'http://bidding.test',
        order: 'http://order.test',
        auth: 'http://auth.test',
        media: 'http://media.test',
      },
      hangingFetch,
    );
    const timeoutService = new MessageService(db, timeoutClient, new CursorCodec('k'.repeat(32)));

    await expect(
      timeoutService.send(customerId, {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Hanging request',
      }),
    ).rejects.toThrow('ELIGIBILITY_UNAVAILABLE');
  });

  it('Scenario 11 & 12: Atomic CTE commits message and outbox consistently or rolls back', async () => {
    const clientMessageId = randomUUID();
    const res = await service.send(customerId, {
      conversationId,
      clientMessageId,
      messageType: 'TEXT',
      content: 'Outbox consistency check',
    });

    expect(outboxEvents.length).toBe(1);
    const event = outboxEvents[0];
    expect(event.eventType).toBe('message.created');
    expect(event.payload.data.messageId).toBe(res.message.id);
    expect(event.payload.data.conversationId).toBe(conversationId);
    expect(event.payload.data.recipientId).toBe(workerId);
  });

  it('Scenario 15: Reply target foreign key violation throws REPLY_NOT_FOUND', async () => {
    await expect(
      service.send(customerId, {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Replying to invalid message',
        replyToId: randomUUID(), // Non-existent reply id triggers 23503
      }),
    ).rejects.toThrow('REPLY_NOT_FOUND');
  });

  it('Scenario 16: Invalidation clears permission cache and generation increment prevents replay', async () => {
    // Send 1 populates permissionCache
    await service.send(customerId, {
      conversationId,
      clientMessageId: randomUUID(),
      messageType: 'TEXT',
      content: 'Message 1',
    });

    // Invalidation event arrives (e.g. order.cancelled or bid.withdrawn)
    const eventId = randomUUID();
    // Authority already reflects the lifecycle change when its event arrives.
    authorityFetch.mockRejectedValue(new Error('Order authority unavailable'));
    await service.invalidate(eventId, 'order.cancelled', { requestId });

    // Ensure permission cache was cleared
    authorityFetch.mockClear();
    authorityFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat-state')) {
        return new Response(
          JSON.stringify({
            data: {
              requestId,
              customerId,
              status: 'cancelled',
              version: 2,
              order: null,
              verifiedAt: new Date().toISOString(),
            },
          }),
        );
      }
      return new Response('{}');
    });

    await expect(
      service.send(customerId, {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT',
        content: 'Message after cancellation',
      }),
    ).rejects.toThrow('CHAT_READ_ONLY');
  });
});
