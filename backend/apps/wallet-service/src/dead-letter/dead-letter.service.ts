import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import { WALLET_EVENTS_QUEUE } from '../common/messaging/consumer-retry.service.js';
import { AmqpConfirmedQueuePublisher } from '../common/messaging/confirmed-queue-publisher.js';

export const REPLAYABLE_EVENT_TYPES = new Set(['payment.topup.succeeded', 'user.registered']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export abstract class DeadLetterPublisher {
  abstract publish(eventType: string, payload: unknown): Promise<void>;
}

@Injectable()
export class AmqpDeadLetterPublisher extends DeadLetterPublisher implements OnModuleDestroy {
  private readonly confirmed = new AmqpConfirmedQueuePublisher();

  /** Resolve chỉ khi broker đã xác nhận message replay. */
  async publish(eventType: string, payload: unknown): Promise<void> {
    await this.confirmed.publish(
      WALLET_EVENTS_QUEUE,
      Buffer.from(JSON.stringify({ pattern: eventType, data: payload })),
      { persistent: true, contentType: 'application/json', headers: { 'x-wallet-replayed': true } },
      { durable: true },
    );
  }

  async onModuleDestroy() {
    await this.confirmed.close();
  }
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly prisma: WalletPrismaService,
    private readonly publisher: DeadLetterPublisher,
  ) {}

  /** Không trả payload để tránh lộ dữ liệu nhạy cảm; payload chỉ được dùng nội bộ khi replay. */
  async list(skip = 0, take = 20) {
    return this.prisma.deadLetterEvent.findMany({
      select: { id: true, eventId: true, eventType: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async replay(id: string, actorId: string) {
    const dead = await this.prisma.deadLetterEvent.findUnique({ where: { id } });
    if (!dead) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Dead letter not found');
    if (!REPLAYABLE_EVENT_TYPES.has(dead.eventType)) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Event type cannot be replayed');
    }
    const payloadUserId = this.extractUserId(dead.payload);
    const metadata = { deadLetterId: dead.id, eventId: dead.eventId, eventType: dead.eventType };

    try {
      await this.publisher.publish(dead.eventType, dead.payload);
    } catch (error) {
      await this.prisma.walletAuditLog.create({
        data: {
          actorId,
          targetUserId: payloadUserId ?? actorId,
          action: 'wallet.dlq.replay_failed',
          reason: `Replay of dead letter ${dead.id} failed to publish`,
          metadata: { ...metadata, error: (error as Error).message.slice(0, 200) },
        },
      });
      throw new AppException(HttpStatus.BAD_GATEWAY, ERROR_CODES.VALIDATION_ERROR, 'Could not publish replay message');
    }

    await this.prisma.walletAuditLog.create({
      data: {
        actorId,
        targetUserId: payloadUserId ?? actorId,
        action: 'wallet.dlq.replay',
        reason: `Replay of dead letter ${dead.id}`,
        metadata,
      },
    });
    this.logger.log(`Dead letter ${dead.id} replayed by ${actorId}`);
    return { id: dead.id, eventType: dead.eventType, replayed: true };
  }

  private extractUserId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as { userId?: unknown; data?: { userId?: unknown } };
    const candidate = typeof p.userId === 'string' ? p.userId : p.data?.userId;
    return typeof candidate === 'string' && UUID_REGEX.test(candidate) ? candidate : null;
  }
}
