import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { Logger } from '@nestjs/common';
import type { JwtPayload } from '../../../libs/auth/src/auth.types.js';
import { IdentityService } from './identity.js';
import { MessageService } from './message.service.js';
import {
  ChatError,
  publicError,
  RateLimits,
  validateInput,
} from './security.js';
import type {
  ChatAck,
  MessageReadInput,
  MessageSendInput,
  TypingUpdate,
} from '../../../libs/common/src/message-contracts/index.js';
interface Session {
  socket: Socket;
  token: string;
  user: JwtPayload;
  timer: NodeJS.Timeout;
}
interface Activity {
  conversationId: string;
  userId: string;
  socketId: string;
  expires: number;
}
export class MessageRealtime {
  readonly io: Server;
  private readonly logger = new Logger(MessageRealtime.name);
  private readonly sessions = new Map<string, Session>();
  // Includes authenticated handshakes that have not reached `connection` yet.
  private readonly slots = new Map<string, Set<string>>();
  private readonly typing = new Map<string, Activity>();
  private readonly timer: NodeJS.Timeout;
  constructor(
    server: HttpServer,
    private readonly identity: IdentityService,
    private readonly messages: MessageService,
    private readonly limits: RateLimits,
    origins: string[],
  ) {
    this.io = new Server(server, {
      path: '/api/v1/chat/socket.io/',
      maxHttpBufferSize: 16384,
      serveClient: false,
      cors: { origin: origins, credentials: true },
      allowRequest: (req, done) =>
        done(null, !req.headers.origin || origins.includes(req.headers.origin)),
    });
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token,
          user = await identity.authenticate(token);
        if (socket.conn.readyState !== 'open')
          throw new ChatError('UNAUTHORIZED');
        const slots = this.slots.get(user.userId) ?? new Set<string>();
        if (slots.size >= 10) throw new ChatError('RATE_LIMITED');
        // No await between checking and reserving: concurrent admissions see this slot.
        slots.add(socket.id);
        this.slots.set(user.userId, slots);
        const release = () => {
          slots.delete(socket.id);
          if (!slots.size && this.slots.get(user.userId) === slots)
            this.slots.delete(user.userId);
        };
        socket.conn.once('close', release);
        socket.once('disconnect', release);
        socket.data.token = token;
        socket.data.user = user;
        next();
      } catch (err) {
        if (err instanceof ChatError && err.code === 'RATE_LIMITED') {
          const error = new Error('Rate limited') as Error & { data: unknown };
          error.data = { code: 'RATE_LIMITED', retryable: true };
          next(error);
          return;
        }
        const error = new Error('Unauthorized') as Error & { data: unknown };
        error.data = { code: 'UNAUTHORIZED', retryable: false };
        next(error);
      }
    });
    this.io.on('connection', (socket) => this.connect(socket));
    this.timer = setInterval(() => {
      void this.expire();
    }, 1000);
    this.timer.unref();
    messages.onMessage = async (message, c) => {
      await this.broadcast([c.customerId, c.workerId], 'message.new', message);
      this.stopUser(c.id, message.senderId);
    };
    messages.onRead = async (state, c) =>
      this.broadcast([c.customerId, c.workerId], 'message.read.updated', state);
    messages.onInvalidation = (ids) => {
      for (const [key, a] of this.typing)
        if (ids.includes(a.conversationId)) {
          this.typing.delete(key);
          this.emitTyping(a.conversationId, a.userId);
        }
    };
  }
  private connect(socket: Socket) {
    const user = socket.data.user as JwtPayload,
      token = socket.data.token as string;
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.min(2147483647, user.exp! * 1000 - Date.now()),
    );
    timer.unref();
    this.sessions.set(socket.id, { socket, user, token, timer });
    void socket.join(`user:${user.userId}`);
    const handle = (
      event: string,
      operation: (input: any, user: JwtPayload) => Promise<unknown>,
    ) =>
      socket.on(event, async (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const respond = ack as (value: ChatAck<unknown>) => void;
        try {
          validateInput(event, input);
          if (event.startsWith('typing.')) {
            const { conversationId } = input as { conversationId: string };
            this.limits.take(`typing-user:${user.userId}`, 120, 60000);
            this.limits.take(`typing-socket:${socket.id}`, 40, 10000);
            this.limits.take(
              `typing-conversation:${socket.id}:${conversationId}`,
              4,
              1000,
            );
            if (event === 'typing.start')
              this.limits.take(
                `typing:${socket.id}:${conversationId}`,
                1,
                1000,
              );
          } else if (event === 'message.send') {
            this.limits.take(`send-short:${user.userId}`, 20, 10000);
            this.limits.take(`send-long:${user.userId}`, 60, 60000);
          } else this.limits.take(`events:${user.userId}`, 120, 60000);
          const current = await this.identity.authenticate(token);
          const data = await operation(input, current);
          respond({ ok: true, data });
        } catch (error) {
          const e = publicError(error);
          respond({
            ok: false,
            error: {
              code: e.code,
              message: e.code,
              retryable: e.retryable,
              ...(e.retryAfterMs ? { retryAfterMs: e.retryAfterMs } : {}),
            },
          });
          if (e.code === 'UNAUTHORIZED') socket.disconnect(true);
          if (e.code === 'CHAT_READ_ONLY' || e.code === 'UNAUTHORIZED')
            this.stopSocket(socket.id);
        }
      });
    handle(
      'conversation.join',
      async (input: { conversationId: string }, u) => {
        const conversation = await this.messages.get(
          u.userId,
          input.conversationId,
        );
        await socket.join(`conversation:${conversation.id}`);
        return { conversation, highWaterSequence: conversation.lastSequence };
      },
    );
    handle(
      'conversation.leave',
      async (input: { conversationId: string }, u) => {
        await this.messages.get(u.userId, input.conversationId);
        await socket.leave(`conversation:${input.conversationId}`);
        this.stopSocket(socket.id, input.conversationId);
        return input;
      },
    );
    handle('message.send', async (input: MessageSendInput, u) => {
      const ackStart = performance.now();
      const result = await this.messages.send(u.userId, input);
      const totalAckMs = Math.round((performance.now() - ackStart) * 100) / 100;
      this.logger.log({
        event: 'message.send.latency',
        conversationId: input.conversationId,
        senderId: u.userId,
        clientMessageId: input.clientMessageId,
        duplicate: result.duplicate,
        membershipCheckMs: result.timings?.membershipCheckMs ?? 0,
        duplicateCheckMs: result.timings?.duplicateCheckMs ?? 0,
        biddingAuthorizationMs: result.timings?.biddingAuthorizationMs ?? 0,
        orderAuthorizationMs: result.timings?.orderAuthorizationMs ?? 0,
        dbTransactionMs: result.timings?.dbTransactionMs ?? 0,
        outboxProcessingMs: result.timings?.outboxProcessingMs ?? 0,
        totalAckMs,
      });
      return { message: result.message, duplicate: result.duplicate };
    });
    handle('message.read', async (input: MessageReadInput, u) =>
      this.messages.read(
        u.userId,
        input.conversationId,
        input.lastReadSequence,
      ),
    );
    for (const event of ['typing.start', 'typing.stop'])
      handle(event, async (input: { conversationId: string }, u) => {
        const c = await this.messages.db.conversation.findUnique({
          where: { id: input.conversationId },
        });
        if (!c || ![c.customerId, c.workerId].includes(u.userId))
          throw new ChatError('CONVERSATION_NOT_FOUND');
        await this.messages.permission(u.userId, c, true);
        if (event === 'typing.start') {
          this.typing.set(`${socket.id}:${c.id}`, {
            conversationId: c.id,
            userId: u.userId,
            socketId: socket.id,
            expires: Date.now() + 5000,
          });
        } else this.typing.delete(`${socket.id}:${c.id}`);
        this.emitTyping(c.id, u.userId);
        return input;
      });
    socket.on('disconnect', () => {
      clearTimeout(timer);
      this.sessions.delete(socket.id);
      this.stopSocket(socket.id);
    });
  }
  private async broadcast(users: string[], event: string, payload: unknown) {
    const ids: string[] = [];
    await Promise.all(
      [...this.sessions.values()]
        .filter((s) => users.includes(s.user.userId))
        .map(async (session) => {
          try {
            await this.identity.authenticate(session.token);
            ids.push(session.socket.id);
          } catch (error) {
            const e = publicError(error);
            if (e.code === 'UNAUTHORIZED') {
              session.socket.disconnect(true);
            }
          }
        }),
    );
    if (ids.length) this.io.to(ids).emit(event, payload);
  }
  private emitTyping(conversationId: string, userId: string) {
    const activities = [...this.typing.values()].filter(
      (a) =>
        a.conversationId === conversationId &&
        a.userId === userId &&
        a.expires > Date.now(),
    );
    const update: TypingUpdate = {
      conversationId,
      userId,
      isTyping: activities.length > 0,
      expiresAt: new Date(
        activities.length
          ? Math.max(...activities.map((a) => a.expires))
          : Date.now(),
      ).toISOString(),
    };
    // Never broadcast self typing, and only to devices that explicitly joined this conversation.
    for (const session of this.sessions.values())
      if (
        session.user.userId !== userId &&
        session.socket.rooms.has(`conversation:${conversationId}`)
      )
        void this.identity
          .authenticate(session.token)
          .then(() => {
            if (session.socket.connected)
              session.socket.volatile.emit('typing.update', update);
          })
          .catch((error) => {
            const e = publicError(error);
            if (e.code === 'UNAUTHORIZED') {
              session.socket.disconnect(true);
            }
          });
  }
  private stopSocket(socketId: string, conversationId?: string) {
    for (const [key, a] of this.typing)
      if (
        a.socketId === socketId &&
        (!conversationId || a.conversationId === conversationId)
      ) {
        this.typing.delete(key);
        this.emitTyping(a.conversationId, a.userId);
      }
  }
  private stopUser(conversationId: string, userId: string) {
    for (const [key, a] of this.typing)
      if (a.conversationId === conversationId && a.userId === userId)
        this.typing.delete(key);
    this.emitTyping(conversationId, userId);
  }
  private async expire() {
    for (const [key, a] of this.typing)
      if (a.expires <= Date.now()) {
        this.typing.delete(key);
        this.emitTyping(a.conversationId, a.userId);
      }
  }
  async close() {
    clearInterval(this.timer);
    for (const s of this.sessions.values()) clearTimeout(s.timer);
    this.typing.clear();
    await new Promise<void>((resolve) => this.io.close(() => resolve()));
    this.slots.clear();
  }
}
