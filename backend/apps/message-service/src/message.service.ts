import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  Conversation,
  Message,
  MessageAttachment,
  ConversationReadState,
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
export class MessageService {
  /** Incremented before event transactions: an authority read cannot reopen across invalidation. */
  private generation = 0;
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
    const c = await tx.conversation.findUnique({ where: { id } });
    if (!c || ![c.customerId, c.workerId].includes(userId))
      throw new ChatError('CONVERSATION_NOT_FOUND');
    return c;
  }
  async permission(userId: string, c: Conversation, required = false) {
    try {
      const result = await this.authority.permission(userId, c, true);
      if (required && !result.permissions.send)
        throw new ChatError('CHAT_READ_ONLY');
      return result;
    } catch (error) {
      if (required) throw error;
      return {
        permissions: { read: true, send: false, create: false },
        orderId: c.orderId,
        bid: undefined,
      };
    }
  }
  private async wireConversation(
    userId: string,
    c: Conversation,
    states: ConversationReadState[],
  ): Promise<ChatConversation> {
    const p = await this.permission(userId, c);
    return {
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
    const items: ChatConversation[] = [];
    for (let i = 0; i < rows.length; i += 5)
      items.push(
        ...(await Promise.all(
          rows.slice(i, i + 5).map((c) =>
            this.wireConversation(
              userId,
              c,
              states.filter((s) => s.conversationId === c.id),
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
  async send(userId: string, input: MessageSendInput) {
    validateInput('message.send', input);
    const c = await this.member(userId, input.conversationId);
    const existing = await this.db.message.findUnique({
      where: {
        senderId_clientMessageId: {
          senderId: userId,
          clientMessageId: input.clientMessageId,
        },
      },
      include,
    });
    if (existing) {
      await this.permission(userId, c, true);
      if (!this.equal(existing, input))
        throw new ChatError('IDEMPOTENCY_CONFLICT');
      return { message: await this.wireMessage(existing), duplicate: true };
    }
    const assets = await this.authority.attachments(input, userId),
      generation = this.generation;
    const admissionDeadline = Date.now() + 2000;
    const proof = await this.permission(userId, c, true);
    const persist = async () =>
      this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM message.conversations WHERE id=${c.id}::uuid FOR UPDATE`;
        if (generation !== this.generation || Date.now() > admissionDeadline)
          throw new ChatError('ELIGIBILITY_UNAVAILABLE');
        if (
          !proof.orderId &&
          proof.bid?.validUntil &&
          Date.parse(proof.bid.validUntil) <= Date.now()
        )
          throw new ChatError('CHAT_READ_ONLY');
        const prior = await tx.message.findUnique({
          where: {
            senderId_clientMessageId: {
              senderId: userId,
              clientMessageId: input.clientMessageId,
            },
          },
          include,
        });
        if (prior) {
          if (!this.equal(prior, input))
            throw new ChatError('IDEMPOTENCY_CONFLICT');
          return { row: prior, duplicate: true };
        }
        if (
          input.replyToId &&
          !(await tx.message.findFirst({
            where: { id: input.replyToId, conversationId: c.id },
            select: { id: true },
          }))
        )
          throw new ChatError('REPLY_NOT_FOUND');
        await tx.conversation.update({
          where: { id: c.id },
          data: {
            status: 'OPEN',
            ...(proof.orderId ? { orderId: proof.orderId } : {}),
          },
        });
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
    let saved: Awaited<ReturnType<typeof persist>>;
    try {
      saved = await persist();
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
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
    }
    const message = await this.wireMessage(saved.row, assets);
    if (!saved.duplicate) void this.onMessage(message, c).catch(() => {});
    return { message, duplicate: saved.duplicate };
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
