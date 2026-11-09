import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type Conversation,
  type Message,
  type MessageAttachment,
  type ConversationReadState,
} from '@prisma/message-client';
import type {
  ChatConversation,
  ChatMessage,
  ChatReadState,
  MessageSendInput,
  MessageHistoryPage,
  MessageListQuery,
  ConversationListQuery,
  MessageCreatedEvent,
} from '../../../libs/common/src/message-contracts/index.js';
import { MessagePrisma } from './persistence.js';
import { AuthorityClient, type MediaReceipt } from './authority.js';
import { ChatError, CursorCodec, validateInput } from './security.js';
type HydratedMessage = Message & {
  attachments: MessageAttachment[];
  replyTo: Message | null;
};
const include = {
  attachments: { orderBy: { position: 'asc' as const } },
  replyTo: true,
};
const readWire = (r: ConversationReadState): ChatReadState => ({
  conversationId: r.conversationId,
  userId: r.userId,
  lastReadSequence: r.lastReadSequence.toString(),
  updatedAt: r.updatedAt.toISOString(),
});

export interface MessageSendTimings {
  membershipCheckMs: number;
  duplicateCheckMs: number;
  biddingAuthorizationMs: number;
  orderAuthorizationMs: number;
  dbTransactionMs: number;
  outboxProcessingMs: number;
  totalAckMs: number;
}

export interface SendResult {
  message: ChatMessage;
  duplicate: boolean;
  timings?: MessageSendTimings;
}

export class MessageService {
  /** Incremented before event transactions: an authority read cannot reopen across invalidation. */
  private generation = 0;
  private readonly memberCache = new Map<
    string,
    { conversation: Conversation; expiresAt: number }
  >();
  private readonly recentMessages = new Map<
    string,
    { message: ChatMessage; raw: Message; expiresAt: number }
  >();

  onRead: (state: ChatReadState, conversation: Conversation) => Promise<void> =
    async () => {};
  onMessage: (
    message: ChatMessage,
    conversation: Conversation,
  ) => Promise<void> = async () => {};
  onInvalidation: (ids: string[]) => void = () => {};
  constructor(
    public readonly db: MessagePrisma,
    public readonly authority: AuthorityClient,
    private readonly cursor: CursorCodec,
  ) {}
  private async member(
    userId: string,
    id: string,
    tx: Prisma.TransactionClient | MessagePrisma = this.db,
  ): Promise<Conversation> {
    validateInput('conversation.join', { conversationId: id });
    if (tx === this.db) {
      const cached = this.memberCache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        const c = cached.conversation;
        if (![c.customerId, c.workerId].includes(userId))
          throw new ChatError('CONVERSATION_NOT_FOUND');
        return c;
      }
    }
    const c = await tx.conversation.findUnique({ where: { id } });
    if (!c || ![c.customerId, c.workerId].includes(userId))
      throw new ChatError('CONVERSATION_NOT_FOUND');
    if (tx === this.db) {
      if (this.memberCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of this.memberCache) {
          if (v.expiresAt <= now) this.memberCache.delete(k);
        }
      }
      this.memberCache.set(id, {
        conversation: c,
        expiresAt: Date.now() + 15_000,
      });
    }
    return c;
  }
  async permission(userId: string, c: Conversation, required = false) {
    if (required && c.status === 'READ_ONLY') {
      throw new ChatError('CHAT_READ_ONLY');
    }
    try {
      const result = await this.authority.permission(
        userId,
        c,
        true,
        undefined,
        undefined,
        this.generation,
      );
      if (required && !result.permissions.send)
        throw new ChatError('CHAT_READ_ONLY');
      return result;
    } catch (error) {
      if (required) throw error;
      return {
        permissions: { read: true, send: false, create: false },
        orderId: c.orderId,
        bid: undefined,
        serviceId: undefined,
        timings: { biddingAuthorizationMs: 0, orderAuthorizationMs: 0 },
      };
    }
  }
  private async wireConversation(
    userId: string,
    c: Conversation,
    states: ConversationReadState[],
    labels?: {
      names?: Promise<Record<string, string>>;
      profiles?: Promise<
        Record<string, { fullName: string; avatarUrl: string | null }>
      >;
      services: Map<string, Promise<string | undefined>>;
    },
  ): Promise<ChatConversation> {
    const p = await this.permission(userId, c);
    const services =
      labels?.services ?? new Map<string, Promise<string | undefined>>();
    if (p.serviceId && !services.has(p.serviceId))
      services.set(p.serviceId, this.authority.serviceName(p.serviceId));
    const [names, profiles, serviceName] = await Promise.all([
      labels?.names ?? this.authority.displayNames([c.customerId, c.workerId]),
      labels?.profiles ??
        this.authority.displayProfiles([c.customerId, c.workerId]),
      p.serviceId ? services.get(p.serviceId) : undefined,
    ]);
    return {
      customerName: names[c.customerId] ?? profiles[c.customerId]?.fullName,
      workerName: names[c.workerId] ?? profiles[c.workerId]?.fullName,
      customerAvatarUrl: profiles[c.customerId]?.avatarUrl ?? null,
      workerAvatarUrl: profiles[c.workerId]?.avatarUrl ?? null,
      serviceName,
      id: c.id,
      requestId: c.requestId,
      orderId: p.orderId ?? c.orderId,
      customerId: c.customerId,
      workerId: c.workerId,
      status: p.permissions.send ? 'OPEN' : 'READ_ONLY',
      lastSequence: c.lastSequence.toString(),
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      permissions: {
        read: true,
        send: p.permissions.send,
        reason: p.permissions.send ? null : 'CHAT_READ_ONLY',
      },
      readStates: states.map(readWire),
    };
  }
  async create(
    userId: string,
    input: { bidId: string },
  ): Promise<{ conversation: ChatConversation; created: boolean }> {
    validateInput('conversation.create', input);
    const generation = this.generation,
      deadline = Date.now() + 2000,
      bid = await this.authority.bid(input.bidId, deadline);
    const proof = await this.authority.permission(
      userId,
      { requestId: bid.requestId, workerId: bid.workerId },
      false,
      bid,
      deadline,
    );
    if (!proof.permissions.create) throw new ChatError('CHAT_INELIGIBLE');
    if (generation !== this.generation)
      throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    let created = false,
      c: Conversation;
    try {
      c = await this.db.conversation.create({
        data: {
          requestId: proof.requestId,
          customerId: proof.customerId,
          workerId: proof.workerId,
          orderId: proof.orderId,
        },
      });
      created = true;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      c = await this.db.conversation.findUniqueOrThrow({
        where: {
          requestId_customerId_workerId: {
            requestId: proof.requestId,
            customerId: proof.customerId,
            workerId: proof.workerId,
          },
        },
      });
    }
    return { conversation: await this.get(userId, c.id), created };
  }
  async get(userId: string, id: string) {
    const c = await this.member(userId, id);
    return this.wireConversation(
      userId,
      c,
      await this.db.conversationReadState.findMany({
        where: { conversationId: id },
      }),
    );
  }
  async list(userId: string, query: ConversationListQuery) {
    validateInput('conversations.list', query);
    const limit = query.limit ?? 30,
      point = query.cursor ? this.cursor.decode(userId, query.cursor) : null;
    // Parameterized tuple keyset matches the expression indexes in the runtime migration.
    const rows = point
      ? await this.db.$queryRaw<
          Conversation[]
        >`SELECT id,request_id AS "requestId",order_id AS "orderId",customer_id AS "customerId",worker_id AS "workerId",status,last_sequence AS "lastSequence",last_message_at AS "lastMessageAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM message.conversations WHERE (customer_id=${userId}::uuid OR worker_id=${userId}::uuid) AND (COALESCE(last_message_at,created_at),id)<(${point.timestamp},${point.id}::uuid) ORDER BY COALESCE(last_message_at,created_at) DESC,id DESC LIMIT ${limit + 1}`
      : await this.db.$queryRaw<
          Conversation[]
        >`SELECT id,request_id AS "requestId",order_id AS "orderId",customer_id AS "customerId",worker_id AS "workerId",status,last_sequence AS "lastSequence",last_message_at AS "lastMessageAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM message.conversations WHERE (customer_id=${userId}::uuid OR worker_id=${userId}::uuid) ORDER BY COALESCE(last_message_at,created_at) DESC,id DESC LIMIT ${limit + 1}`;
    const more = rows.length > limit;
    rows.length = Math.min(rows.length, limit);
    const states = await this.db.conversationReadState.findMany({
      where: { conversationId: { in: rows.map((c) => c.id) } },
    });
    // Bound upstream concurrency: list never starts 200 dependency calls together.
    const labels = {
      names: this.authority.displayNames(
        rows.flatMap((c) => [c.customerId, c.workerId]),
      ),
      profiles: this.authority.displayProfiles(
        rows.flatMap((c) => [c.customerId, c.workerId]),
      ),
      services: new Map<string, Promise<string | undefined>>(),
    };
    const items: ChatConversation[] = [];
    for (let i = 0; i < rows.length; i += 5)
      items.push(
        ...(await Promise.all(
          rows.slice(i, i + 5).map((c) =>
            this.wireConversation(
              userId,
              c,
              states.filter((s) => s.conversationId === c.id),
              labels,
            ),
          ),
        )),
      );
    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        more && last
          ? this.cursor.encode(
              userId,
              last.lastMessageAt ?? last.createdAt,
              last.id,
            )
          : null,
    };
  }
  async history(
    userId: string,
    id: string,
    query: MessageListQuery,
  ): Promise<MessageHistoryPage> {
    validateInput('messages.list', query);
    await this.member(userId, id);
    const limit = query.limit ?? 30,
      after = query.afterSequence !== undefined;
    const result = await this.db.$transaction(
      async (tx) => {
        const c = await this.member(userId, id, tx);
        const items = await tx.message.findMany({
          where: {
            conversationId: id,
            sequence: after
              ? { gt: BigInt(query.afterSequence!) }
              : query.beforeSequence
                ? { lt: BigInt(query.beforeSequence) }
                : undefined,
          },
          include,
          orderBy: { sequence: after ? 'asc' : 'desc' },
          take: limit + 1,
        });
        return { c, items };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const more = result.items.length > limit;
    result.items.length = Math.min(result.items.length, limit);
    if (!after) result.items.reverse();
    return {
      items: await Promise.all(result.items.map((m) => this.wireMessage(m))),
      nextBeforeSequence:
        !after && more ? result.items[0]!.sequence.toString() : null,
      nextAfterSequence:
        after && more ? result.items.at(-1)!.sequence.toString() : null,
      highWaterSequence: result.c.lastSequence.toString(),
    };
  }
  private equal(m: HydratedMessage, input: MessageSendInput) {
    return (
      m.conversationId === input.conversationId &&
      m.messageType === input.messageType &&
      m.content === (input.content ?? null) &&
      m.replyToId === (input.replyToId ?? null) &&
      JSON.stringify(m.attachments.map((a) => a.storageKey)) ===
        JSON.stringify((input.attachments ?? []).map((a) => a.storageKey))
    );
  }
  private constraintViolation(
    error: unknown,
    kind: 'unique' | 'reply',
  ): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as {
      code?: string;
      constraint?: string;
      meta?: {
        code?: string;
        message?: string;
        target?: string[] | string;
        field_name?: string;
        driverAdapterError?: {
          cause?: {
            originalCode?: string;
            constraint?: { index?: string; fields?: string[] };
          };
        };
      };
    };
    const meta = e.meta;
    const cause = meta?.driverAdapterError?.cause;
    const code =
      e.code === 'P2010' ? (cause?.originalCode ?? meta?.code) : e.code;
    const codes = kind === 'unique' ? ['P2002', '23505'] : ['P2003', '23503'];
    if (!code || !codes.includes(code)) return false;
    const constraint =
      kind === 'unique'
        ? 'messages_sender_id_client_message_id_key'
        : 'messages_conversation_id_reply_to_id_fkey';
    const name = e.constraint ?? cause?.constraint?.index ?? meta?.field_name;
    if (name === constraint || name?.startsWith(`${constraint} `)) return true;
    const fields = cause?.constraint?.fields ?? meta?.target;
    if (fields === constraint) return true;
    if (
      kind === 'unique' &&
      Array.isArray(fields) &&
      fields.length === 2 &&
      fields.includes('sender_id') &&
      fields.includes('client_message_id')
    )
      return true;
    return meta?.message?.includes(`"${constraint}"`) === true;
  }

  private cacheRecentMessage(
    userId: string,
    clientMessageId: string,
    raw: HydratedMessage,
    message: ChatMessage,
  ) {
    if (this.recentMessages.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.recentMessages) {
        if (v.expiresAt <= now) this.recentMessages.delete(k);
      }
    }
    this.recentMessages.set(`${userId}:${clientMessageId}`, {
      message,
      raw,
      expiresAt: Date.now() + 60_000,
    });
  }

  private async persistAtomicText(params: {
    c: Conversation;
    userId: string;
    input: MessageSendInput;
    proof: any;
    generation: number;
    admissionDeadline: number;
  }): Promise<{ row: HydratedMessage; duplicate: boolean }> {
    if (
      params.generation !== this.generation ||
      Date.now() > params.admissionDeadline
    )
      throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    if (
      !params.proof.orderId &&
      params.proof.bid?.validUntil &&
      Date.parse(params.proof.bid.validUntil) <= Date.now()
    )
      throw new ChatError('CHAT_READ_ONLY');

    const messageId = randomUUID();
    const eventId = randomUUID();
    const event: MessageCreatedEvent = {
      eventId,
      eventType: 'message.created',
      eventVersion: 1,
      producer: 'message-service',
      occurredAt: new Date().toISOString(),
      correlationId: eventId,
      data: {
        messageId,
        conversationId: params.c.id,
        requestId: params.c.requestId,
        orderId: params.proof.orderId ?? params.c.orderId,
        senderId: params.userId,
        recipientId:
          params.userId === params.c.customerId
            ? params.c.workerId
            : params.c.customerId,
        sequence: '0',
        messageType: 'TEXT',
      },
    };

    const payloadJson = JSON.stringify(event);
    const replyToId = params.input.replyToId ?? null;
    const orderIdToSet =
      params.proof.orderId && !params.c.orderId ? params.proof.orderId : null;

    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        conversation_id: string;
        sender_id: string;
        client_message_id: string;
        message_type: 'TEXT';
        content: string | null;
        reply_to_id: string | null;
        sequence: bigint;
        created_at: Date;
        reply_id: string | null;
        reply_conversation_id: string | null;
        reply_sender_id: string | null;
        reply_client_message_id: string | null;
        reply_message_type: 'TEXT' | 'IMAGE' | 'VIDEO' | null;
        reply_content: string | null;
        reply_reply_to_id: string | null;
        reply_sequence: bigint | null;
        reply_created_at: Date | null;
      }>
    >`
      WITH
      ${
        orderIdToSet
          ? Prisma.sql`
        upd_conv AS (
          UPDATE message.conversations
          SET order_id = ${orderIdToSet}::uuid
          WHERE id = ${params.c.id}::uuid AND order_id IS NULL
        ),`
          : Prisma.empty
      }
      new_msg AS (
        INSERT INTO message.messages (
          id, conversation_id, sender_id, client_message_id, message_type, content, reply_to_id
        ) VALUES (
          ${messageId}::uuid,
          ${params.c.id}::uuid,
          ${params.userId}::uuid,
          ${params.input.clientMessageId}::uuid,
          'TEXT'::message.message_type,
          ${params.input.content ?? null},
          ${replyToId ? Prisma.sql`${replyToId}::uuid` : Prisma.sql`NULL`}
        )
        RETURNING *
      ),
      new_outbox AS (
        INSERT INTO message.outbox_events (
          id, aggregate_type, aggregate_id, event_type, event_version, payload, status
        )
        SELECT
          ${eventId}::uuid,
          'message',
          new_msg.id,
          'message.created',
          1,
          jsonb_set(
            jsonb_set(${payloadJson}::jsonb, '{data,sequence}', to_jsonb(new_msg.sequence::text)),
            '{occurredAt}', to_jsonb(to_char(new_msg.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          ),
          'pending'
        FROM new_msg
      )
      SELECT
        new_msg.id,
        new_msg.conversation_id,
        new_msg.sender_id,
        new_msg.client_message_id,
        new_msg.message_type,
        new_msg.content,
        new_msg.reply_to_id,
        new_msg.sequence,
        new_msg.created_at,
        target_reply.id AS reply_id,
        target_reply.conversation_id AS reply_conversation_id,
        target_reply.sender_id AS reply_sender_id,
        target_reply.client_message_id AS reply_client_message_id,
        target_reply.message_type AS reply_message_type,
        target_reply.content AS reply_content,
        target_reply.reply_to_id AS reply_reply_to_id,
        target_reply.sequence AS reply_sequence,
        target_reply.created_at AS reply_created_at
      FROM new_msg
      LEFT JOIN message.messages target_reply
        ON target_reply.id = new_msg.reply_to_id AND target_reply.conversation_id = new_msg.conversation_id;
    `;

    if (!rows || rows.length === 0) {
      throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    }

    const r = rows[0];
    const replyTo: Message | null = r.reply_id
      ? {
          id: r.reply_id,
          conversationId: r.reply_conversation_id!,
          senderId: r.reply_sender_id!,
          clientMessageId: r.reply_client_message_id!,
          messageType: r.reply_message_type!,
          content: r.reply_content,
          replyToId: r.reply_reply_to_id,
          sequence: BigInt(r.reply_sequence!),
          createdAt: new Date(r.reply_created_at!),
        }
      : null;

    const row: HydratedMessage = {
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      clientMessageId: r.client_message_id,
      messageType: r.message_type,
      content: r.content,
      replyToId: r.reply_to_id,
      sequence: BigInt(r.sequence),
      createdAt: new Date(r.created_at),
      attachments: [],
      replyTo,
    };

    return { row, duplicate: false };
  }

  private async persistMedia(params: {
    c: Conversation;
    userId: string;
    input: MessageSendInput;
    assets: MediaReceipt[];
    proof: any;
    generation: number;
    admissionDeadline: number;
  }): Promise<{ row: HydratedMessage; duplicate: boolean }> {
    const { c, userId, input, assets, proof, generation, admissionDeadline } =
      params;
    return this.db.$transaction(async (tx) => {
      if (generation !== this.generation || Date.now() > admissionDeadline)
        throw new ChatError('ELIGIBILITY_UNAVAILABLE');
      if (
        !proof.orderId &&
        proof.bid?.validUntil &&
        Date.parse(proof.bid.validUntil) <= Date.now()
      )
        throw new ChatError('CHAT_READ_ONLY');

      if (proof.orderId && !c.orderId) {
        await tx.conversation.update({
          where: { id: c.id },
          data: { orderId: proof.orderId },
        });
      }

      const row = await tx.message.create({
        data: {
          conversationId: c.id,
          senderId: userId,
          clientMessageId: input.clientMessageId,
          messageType: input.messageType,
          content: input.content,
          replyToId: input.replyToId,
          attachments: {
            create: assets.map((a, position) => ({
              storageKey: a.storageKey,
              mediaType: a.mediaType,
              mimeType: a.mimeType,
              sizeBytes: BigInt(a.sizeBytes),
              position,
              width: a.width,
              height: a.height,
              durationMs: a.durationMs,
            })),
          },
        },
        include,
      });

      const eventId = randomUUID();
      const event: MessageCreatedEvent = {
        eventId,
        eventType: 'message.created',
        eventVersion: 1,
        producer: 'message-service',
        occurredAt: row.createdAt.toISOString(),
        correlationId: eventId,
        data: {
          messageId: row.id,
          conversationId: c.id,
          requestId: c.requestId,
          orderId: proof.orderId ?? c.orderId,
          senderId: userId,
          recipientId: userId === c.customerId ? c.workerId : c.customerId,
          sequence: row.sequence.toString(),
          messageType: row.messageType,
        },
      };

      await tx.outboxEvent.create({
        data: {
          id: eventId,
          aggregateId: row.id,
          eventType: 'message.created',
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });

      if (generation !== this.generation)
        throw new ChatError('ELIGIBILITY_UNAVAILABLE');

      return { row, duplicate: false };
    });
  }

  async send(userId: string, input: MessageSendInput): Promise<SendResult> {
    const totalStart = performance.now();
    validateInput('message.send', input);

    // 1. Rapid retry in-memory check (<1ms)
    const tDup0 = performance.now();
    const cachedWinner = this.recentMessages.get(
      `${userId}:${input.clientMessageId}`,
    );
    if (cachedWinner) {
      const cacheFresh =
        cachedWinner.expiresAt > Date.now() &&
        cachedWinner.message.attachments.every(
          (a) => Date.parse(a.urlExpiresAt) > Date.now(),
        );
      if (!this.equal(cachedWinner.raw as HydratedMessage, input))
        throw new ChatError('IDEMPOTENCY_CONFLICT');
      let message = cachedWinner.message;
      if (!cacheFresh) {
        this.recentMessages.delete(`${userId}:${input.clientMessageId}`);
        const conversation = await this.member(userId, input.conversationId);
        const proof = await this.permission(userId, conversation);
        if (!proof.permissions.read)
          throw new ChatError('CONVERSATION_NOT_FOUND');
        message = await this.wireMessage(cachedWinner.raw as HydratedMessage);
        this.cacheRecentMessage(
          userId,
          input.clientMessageId,
          cachedWinner.raw as HydratedMessage,
          message,
        );
      }
      const duplicateCheckMs =
        Math.round((performance.now() - tDup0) * 100) / 100;
      return {
        message,
        duplicate: true,
        timings: {
          membershipCheckMs: 0,
          duplicateCheckMs,
          biddingAuthorizationMs: 0,
          orderAuthorizationMs: 0,
          dbTransactionMs: 0,
          outboxProcessingMs: 0,
          totalAckMs: Math.round((performance.now() - totalStart) * 100) / 100,
        },
      };
    }

    // 2. Member check (cached or DB)
    const tMember0 = performance.now();
    const c = await this.member(userId, input.conversationId);
    const membershipCheckMs =
      Math.round((performance.now() - tMember0) * 100) / 100;

    if (c.status === 'READ_ONLY') {
      throw new ChatError('CHAT_READ_ONLY');
    }

    // 3. Attachments verification (only if media)
    const assets = await this.authority.attachments(input, userId);
    const generation = this.generation;
    const admissionDeadline = Date.now() + 2000;

    // 4. Permission check with generation invalidation & timing instrumentation
    const proof = await this.permission(userId, c, true);
    const biddingAuthorizationMs = proof.timings?.biddingAuthorizationMs ?? 0;
    const orderAuthorizationMs = proof.timings?.orderAuthorizationMs ?? 0;

    // 5. Atomic persistence
    const tDb0 = performance.now();
    let saved: { row: HydratedMessage; duplicate: boolean };

    try {
      if (input.messageType === 'TEXT' && (!assets || assets.length === 0)) {
        saved = await this.persistAtomicText({
          c,
          userId,
          input,
          proof,
          generation,
          admissionDeadline,
        });
      } else {
        saved = await this.persistMedia({
          c,
          userId,
          input,
          assets,
          proof,
          generation,
          admissionDeadline,
        });
      }
    } catch (error) {
      if (this.constraintViolation(error, 'unique')) {
        const winner = await this.db.message.findUnique({
          where: {
            senderId_clientMessageId: {
              senderId: userId,
              clientMessageId: input.clientMessageId,
            },
          },
          include,
        });
        if (!winner || !this.equal(winner, input))
          throw new ChatError('IDEMPOTENCY_CONFLICT');
        saved = { row: winner, duplicate: true };
      } else if (this.constraintViolation(error, 'reply')) {
        throw new ChatError('REPLY_NOT_FOUND');
      } else {
        throw error;
      }
    }

    const dbTransactionMs = Math.round((performance.now() - tDb0) * 100) / 100;
    const outboxProcessingMs = dbTransactionMs;
    const duplicateCheckMs =
      Math.round((performance.now() - tDup0) * 100) / 100;

    // 6. Format message for ACK response
    const message = await this.wireMessage(saved.row, assets);
    this.cacheRecentMessage(userId, input.clientMessageId, saved.row, message);

    if (!saved.duplicate) void this.onMessage(message, c).catch(() => {});

    const totalAckMs = Math.round((performance.now() - totalStart) * 100) / 100;

    return {
      message,
      duplicate: saved.duplicate,
      timings: {
        membershipCheckMs,
        duplicateCheckMs,
        biddingAuthorizationMs,
        orderAuthorizationMs,
        dbTransactionMs,
        outboxProcessingMs,
        totalAckMs,
      },
    };
  }
  async read(userId: string, id: string, lastReadSequence: string) {
    validateInput('message.read', { conversationId: id, lastReadSequence });
    const result = await this.db.$transaction(async (tx) => {
      const c = await this.member(userId, id, tx);
      if (
        BigInt(lastReadSequence) > c.lastSequence ||
        (lastReadSequence !== '0' &&
          !(await tx.message.findUnique({
            where: {
              conversationId_sequence: {
                conversationId: id,
                sequence: BigInt(lastReadSequence),
              },
            },
            select: { id: true },
          })))
      )
        throw new ChatError('VALIDATION_ERROR');
      // Lock the parent so simultaneous devices observe a single monotonic advancement.
      await tx.$queryRaw`SELECT id FROM message.conversations WHERE id=${id}::uuid FOR UPDATE`;
      const old = await tx.conversationReadState.findUnique({
        where: { conversationId_userId: { conversationId: id, userId } },
      });
      const state = await tx.conversationReadState.upsert({
        where: { conversationId_userId: { conversationId: id, userId } },
        create: {
          conversationId: id,
          userId,
          lastReadSequence: BigInt(lastReadSequence),
        },
        update: { lastReadSequence: BigInt(lastReadSequence) },
      });
      return {
        state,
        c,
        advanced: state.lastReadSequence > (old?.lastReadSequence ?? 0n),
      };
    });
    const state = readWire(result.state);
    if (result.advanced) void this.onRead(state, result.c).catch(() => {});
    return state;
  }
  private async wireMessage(
    m: HydratedMessage,
    verified?: MediaReceipt[],
  ): Promise<ChatMessage> {
    const attachments = await Promise.all(
      m.attachments.map(async (a) => {
        const media =
          verified?.find((asset) => asset.storageKey === a.storageKey) ??
          (await this.authority.media(a.storageKey, m.senderId, a.mediaType));
        return {
          id: a.id,
          storageKey: a.storageKey,
          mediaType: a.mediaType,
          mimeType: a.mimeType,
          sizeBytes: Number(a.sizeBytes),
          position: a.position,
          width: a.width,
          height: a.height,
          durationMs: a.durationMs,
          url: media.url,
          urlExpiresAt: media.urlExpiresAt,
        };
      }),
    );
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      clientMessageId: m.clientMessageId,
      sequence: m.sequence.toString(),
      messageType: m.messageType,
      content: m.content,
      replyToId: m.replyToId,
      reply: m.replyTo
        ? {
            id: m.replyTo.id,
            senderId: m.replyTo.senderId,
            messageType: m.replyTo.messageType,
            content:
              m.replyTo.content === null
                ? null
                : [...m.replyTo.content].slice(0, 160).join(''),
            unavailable: false,
          }
        : m.replyToId
          ? {
              id: m.replyToId,
              senderId: null,
              messageType: null,
              content: null,
              unavailable: true,
            }
          : null,
      attachments,
      createdAt: m.createdAt.toISOString(),
    };
  }
  async invalidate(
    eventId: string,
    eventType: string,
    data: Record<string, unknown>,
  ) {
    this.generation++;
    const requestId = data.requestId ?? data.serviceRequestId,
      orderId = data.orderId;
    this.memberCache.clear();
    this.recentMessages.clear();
    this.authority.clearPermissionCache(
      typeof requestId === 'string' ? requestId : undefined,
    );
    let recoveredIds: string[] = [];
    if (typeof requestId !== 'string' && typeof orderId === 'string') {
      const customerId = data.customerId ?? data.customerUserId,
        workerId = data.workerId ?? data.workerUserId;
      if (typeof customerId !== 'string' || typeof workerId !== 'string')
        throw new ChatError('VALIDATION_ERROR');
      const candidates = await this.db.conversation.findMany({
        where: { customerId, workerId, orderId: null },
        take: 100,
      });
      for (const c of candidates) {
        const proof = await this.authority.permission(c.customerId, c, true);
        if (proof.orderId === orderId) {
          recoveredIds.push(c.id);
          await this.db.conversation.update({
            where: { id: c.id },
            data: { orderId },
          });
        }
      }
    }
    const rows = await this.db.$transaction(async (tx) => {
      if (await tx.consumedEvent.findUnique({ where: { eventId } })) return [];
      const where: Prisma.ConversationWhereInput =
        typeof requestId === 'string'
          ? { requestId }
          : typeof orderId === 'string'
            ? {
                OR: [
                  { orderId },
                  ...(recoveredIds.length
                    ? [{ id: { in: recoveredIds } }]
                    : []),
                ],
              }
            : {};
      if (!Object.keys(where).length) throw new ChatError('VALIDATION_ERROR');
      const rows = await tx.conversation.findMany({ where });
      await tx.conversation.updateMany({
        where,
        data: { status: 'READ_ONLY' },
      });
      await tx.consumedEvent.create({ data: { eventId, eventType } });
      return rows;
    });
    this.onInvalidation(rows.map((c) => c.id));
  }
  async reconcile() {
    const rows = await this.db.conversation.findMany({
      take: 100,
      orderBy: { updatedAt: 'asc' },
    });
    for (const c of rows) {
      const generation = this.generation;
      try {
        const proof = await this.authority.permission(c.customerId, c, true);
        if (generation !== this.generation) continue;
        await this.db.conversation.update({
          where: { id: c.id },
          data: {
            status: proof.permissions.send ? 'OPEN' : 'READ_ONLY',
            ...(proof.orderId ? { orderId: proof.orderId } : {}),
          },
        });
      } catch {
        /* fail closed for writes; no destructive history operation */
      }
    }
  }
}
