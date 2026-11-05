import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import { RabbitMQContextService } from '@app/rabbitmq';
import { PaymentPrismaService } from '../database/payment-prisma.service.js';
import type { PaymentTx } from '../outbox/payment-events.js';
import { backgroundJobEnabled, startLoop } from '../runtime/background-job.js';
import {
  PermanentInboundError,
  RetryableInboundError,
  unwrapInboundEvent,
  type InboundEvent,
} from './inbound-event.js';

export type InboundHandler = (data: Record<string, unknown>, tx: PaymentTx, event: InboundEvent) => Promise<void>;
export type InboundOutcome = 'processed' | 'duplicate' | 'retry_scheduled' | 'dead';

const DEFAULT_MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60_000;

export function inboundMaxAttempts(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PAYMENT_INBOUND_MAX_ATTEMPTS);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : DEFAULT_MAX_ATTEMPTS;
}

export function inboundRetryDelayMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

function safeError(error: unknown): string {
  if (error instanceof PermanentInboundError || error instanceof RetryableInboundError) {
    return `${error.name}: ${error.message}`.slice(0, 500);
  }
  const code = (error as { code?: unknown } | null)?.code;
  const name = error instanceof Error ? error.name : 'UnknownError';
  return typeof code === 'string' ? `${name}: ${code}` : name;
}

/**
 * Transactional inbox: the consumed-event marker, the business change and the removal of any
 * pending retry row commit together. Failures are persisted for bounded retry (`failed_inbound_events`)
 * before the broker message is ACKed, so no event is lost and duplicates are harmless.
 */
@Injectable()
export class PaymentInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentInboxService.name);
  private readonly handlers = new Map<string, InboundHandler>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: PaymentPrismaService,
    private readonly rabbit: RabbitMQContextService,
  ) {}

  onModuleInit(): void {
    if (!backgroundJobEnabled('PAYMENT_INBOUND_RETRY_ENABLED')) return;
    this.timer = startLoop(
      () => this.retryDue(),
      5_000,
      (error) => this.logger.warn(`Inbound retry cycle failed: ${safeError(error)}`),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  register(eventType: string, handler: InboundHandler): void {
    this.handlers.set(eventType, handler);
  }

  async consume(eventType: string, raw: unknown, context: RmqContext): Promise<void> {
    try {
      const outcome = await this.handle(eventType, raw);
      this.logger.debug(`Inbound ${eventType}: ${outcome}`);
      this.rabbit.ack(context);
    } catch (error) {
      // Could not even persist the failure: let the broker redeliver.
      this.logger.error(`Inbound ${eventType} could not be processed or recorded: ${safeError(error)}`);
      this.rabbit.nack(context, true);
    }
  }

  async handle(eventType: string, raw: unknown): Promise<InboundOutcome> {
    let event: InboundEvent;
    try {
      event = unwrapInboundEvent(raw);
    } catch (error) {
      this.logger.warn(`Dropping ${eventType} without a usable envelope: ${safeError(error)}`);
      return 'dead';
    }
    const handler = this.handlers.get(eventType);
    if (!handler) {
      this.logger.warn(`No inbound handler registered for ${eventType}`);
      return 'dead';
    }

    try {
      return await this.database.client.$transaction(async (tx) => {
        const marker = await tx.consumedEvent.createMany({
          data: [{ eventId: event.eventId, eventType }],
          skipDuplicates: true,
        });
        if (marker.count === 0) return 'duplicate' as const;
        await handler(event.data, tx, event);
        await tx.failedInboundEvent.deleteMany({ where: { eventId: event.eventId } });
        return 'processed' as const;
      });
    } catch (error) {
      return this.recordFailure(event, eventType, raw, error);
    }
  }

  async retryDue(limit = 20, now = new Date()): Promise<number> {
    const rows = await this.database.client.failedInboundEvent.findMany({
      where: { status: 'retrying', nextRetryAt: { lte: now } },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
    for (const row of rows) await this.handle(row.eventType, row.payload);
    return rows.length;
  }

  private async recordFailure(event: InboundEvent, eventType: string, raw: unknown, error: unknown): Promise<InboundOutcome> {
    const previous = await this.database.client.failedInboundEvent.findUnique({ where: { eventId: event.eventId } });
    const attempts = (previous?.attempts ?? 0) + 1;
    const dead = error instanceof PermanentInboundError || attempts >= inboundMaxAttempts();
    const lastError = safeError(error);
    const nextRetryAt = new Date(Date.now() + inboundRetryDelayMs(attempts));
    const status = dead ? 'dead' : 'retrying';
    await this.database.client.failedInboundEvent.upsert({
      where: { eventId: event.eventId },
      create: { eventId: event.eventId, eventType, payload: raw as object, status, attempts, nextRetryAt, lastError },
      update: { status, attempts, nextRetryAt, lastError },
    });
    if (dead) this.logger.error(`Inbound ${eventType} ${event.eventId} parked as dead after ${attempts} attempt(s): ${lastError}`);
    else this.logger.warn(`Inbound ${eventType} ${event.eventId} failed (attempt ${attempts}); retry scheduled: ${lastError}`);
    return dead ? 'dead' : 'retry_scheduled';
  }
}
