import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import { AmqpConfirmedQueuePublisher, ConfirmedQueuePublisher } from './confirmed-queue-publisher.js';

export const WALLET_EVENTS_QUEUE = 'wallet-service-events';
export const RETRY_COUNT_HEADER = 'x-wallet-retry-count';
export const DEAD_REASON_HEADER = 'x-wallet-dead-reason';
export const DEFAULT_RETRY_DELAYS_MS = [5_000, 30_000, 300_000];

export interface ConsumerRetryConfig {
  queue: string;
  /** Mỗi phần tử là delay của một lần retry; số phần tử = số lần retry tối đa sau lần xử lý đầu. */
  delaysMs: number[];
}

export function parseRetryDelays(raw: string | undefined): number[] {
  if (!raw || raw.trim() === '') return DEFAULT_RETRY_DELAYS_MS;
  const parsed = raw.split(',').map((part) => Number(part.trim()));
  if (parsed.some((n) => !Number.isInteger(n) || n < 1)) return DEFAULT_RETRY_DELAYS_MS;
  return parsed;
}

export function loadRetryConfig(env: NodeJS.ProcessEnv = process.env): ConsumerRetryConfig {
  return {
    queue: WALLET_EVENTS_QUEUE,
    delaysMs: parseRetryDelays(env['WALLET_CONSUMER_RETRY_DELAYS_MS']),
  };
}

export type RetryOutcome =
  | { action: 'retry'; attempt: number; delayMs: number }
  | { action: 'dead_letter'; attempts: number };

interface AmqpChannelLike {
  ack(message: unknown): void;
  nack(message: unknown, allUpTo?: boolean, requeue?: boolean): void;
}

interface AmqpMessageLike {
  content: Buffer;
  properties: { headers?: Record<string, unknown>; contentType?: string };
}

/**
 * Retry của consumer: message lỗi tạm thời được đẩy sang retry queue có TTL rồi
 * dead-letter ngược về queue chính. Khác với retry của outbox publisher (publish phía producer).
 * Bản retry/DLQ phải được broker xác nhận (publisher confirm) rồi mới ACK bản gốc; publish/confirm
 * lỗi thì NACK requeue. Nếu crash giữa hai bước, broker redeliver bản gốc nên
 * consumer phải idempotent theo business operation.
 */
@Injectable()
export class ConsumerRetryService implements OnModuleDestroy {
  private readonly logger = new Logger(ConsumerRetryService.name);
  readonly config: ConsumerRetryConfig;
  private publisher: ConfirmedQueuePublisher = new AmqpConfirmedQueuePublisher();

  constructor() {
    this.config = loadRetryConfig();
  }

  static withConfig(config: ConsumerRetryConfig, publisher?: ConfirmedQueuePublisher): ConsumerRetryService {
    const service = new ConsumerRetryService();
    (service as { config: ConsumerRetryConfig }).config = config;
    if (publisher) service.publisher = publisher;
    return service;
  }

  async onModuleDestroy() {
    await this.publisher.close();
  }

  get dlqName(): string {
    return `${this.config.queue}.dlq`;
  }

  retryQueueName(delayMs: number): string {
    return `${this.config.queue}.retry.${delayMs}`;
  }

  async retryOrDeadLetter(context: RmqContext, reason: string): Promise<RetryOutcome> {
    const channel = context.getChannelRef() as AmqpChannelLike;
    const message = context.getMessage() as AmqpMessageLike;
    const attempt = this.attemptOf(message);
    const delayMs = this.config.delaysMs[attempt];

    if (delayMs === undefined) {
      try {
        await this.publishDeadLetter(message, `retries exhausted: ${reason}`);
      } catch (error) {
        this.logger.error(`Could not publish to DLQ, requeueing original message: ${(error as Error).message}`);
        channel.nack(message, false, true);
        return { action: 'dead_letter', attempts: attempt };
      }
      channel.ack(message);
      return { action: 'dead_letter', attempts: attempt };
    }

    try {
      await this.publisher.publish(
        this.retryQueueName(delayMs),
        message.content,
        {
          persistent: true,
          contentType: message.properties.contentType,
          headers: { ...message.properties.headers, [RETRY_COUNT_HEADER]: attempt + 1 },
        },
        {
          durable: true,
          arguments: {
            'x-message-ttl': delayMs,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': this.config.queue,
          },
        },
      );
    } catch (error) {
      this.logger.error(`Could not schedule retry, requeueing original message: ${(error as Error).message}`);
      channel.nack(message, false, true);
      return { action: 'retry', attempt: attempt + 1, delayMs: 0 };
    }
    channel.ack(message);
    return { action: 'retry', attempt: attempt + 1, delayMs };
  }

  async deadLetter(context: RmqContext, reason: string): Promise<void> {
    const channel = context.getChannelRef() as AmqpChannelLike;
    const message = context.getMessage() as AmqpMessageLike;
    try {
      await this.publishDeadLetter(message, reason);
    } catch (error) {
      this.logger.error(`Could not publish to DLQ, requeueing original message: ${(error as Error).message}`);
      channel.nack(message, false, true);
      return;
    }
    channel.ack(message);
  }

  private attemptOf(message: AmqpMessageLike): number {
    const raw = message.properties.headers?.[RETRY_COUNT_HEADER];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  private publishDeadLetter(message: AmqpMessageLike, reason: string) {
    return this.publisher.publish(
      this.dlqName,
      message.content,
      {
        persistent: true,
        contentType: message.properties.contentType,
        headers: { ...message.properties.headers, [DEAD_REASON_HEADER]: reason.slice(0, 500) },
      },
      { durable: true },
    );
  }
}
