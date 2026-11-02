import { Logger } from '@nestjs/common';

export interface QueuePublishOptions {
  persistent?: boolean;
  contentType?: string;
  headers?: Record<string, unknown>;
}

/** Publish vào queue và chỉ resolve khi broker đã xác nhận (publisher confirm). */
export abstract class ConfirmedQueuePublisher {
  abstract publish(
    queue: string,
    content: Buffer,
    options: QueuePublishOptions,
    queueOptions?: Record<string, unknown>,
  ): Promise<void>;
  abstract close(): Promise<void>;
}

interface ConfirmChannelLike {
  assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown>;
  sendToQueue(queue: string, content: Buffer, options: Record<string, unknown>, cb: (err: unknown) => void): boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  close(): Promise<void>;
}
interface ConnectionLike {
  createConfirmChannel(): Promise<ConfirmChannelLike>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  close(): Promise<void>;
}

/**
 * Dùng connection + confirm channel riêng (không dùng channel của consumer Nest, vốn không bật confirm).
 * Lỗi/đóng kết nối làm reset để lần publish sau tự kết nối lại.
 */
export class AmqpConfirmedQueuePublisher extends ConfirmedQueuePublisher {
  private readonly logger = new Logger(AmqpConfirmedQueuePublisher.name);
  private connection?: ConnectionLike;
  private channel?: Promise<ConfirmChannelLike>;

  constructor(private readonly urlProvider: () => string = () => process.env['RABBITMQ_URL'] ?? '') {
    super();
  }

  private reset() {
    this.channel = undefined;
    this.connection = undefined;
  }

  private getChannel(): Promise<ConfirmChannelLike> {
    if (this.channel) return this.channel;
    const pending = (async () => {
      const url = this.urlProvider();
      if (!url) throw new Error('RABBITMQ_URL is not configured');
      const amqp = await import('amqplib');
      const connection = (await amqp.connect(url)) as unknown as ConnectionLike;
      connection.on('error', (e) => this.logger.warn(`confirm connection error: ${String(e)}`));
      connection.on('close', () => this.reset());
      const channel = await connection.createConfirmChannel();
      channel.on('error', () => this.reset());
      channel.on('close', () => this.reset());
      this.connection = connection;
      return channel;
    })();
    this.channel = pending;
    pending.catch(() => {
      if (this.channel === pending) this.reset();
    });
    return pending;
  }

  async publish(queue: string, content: Buffer, options: QueuePublishOptions, queueOptions: Record<string, unknown> = { durable: true }) {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, queueOptions);
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(queue, content, { ...options }, (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
    });
  }

  async close() {
    const connection = this.connection;
    this.reset();
    await connection?.close().catch(() => undefined);
  }
}
