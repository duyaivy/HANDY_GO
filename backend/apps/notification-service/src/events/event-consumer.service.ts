import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  connect,
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage, Message } from 'amqplib';
import {
  MAX_EVENT_BYTES,
  PermanentEventError,
  validateNotificationEvent,
  type NotificationEvent,
} from './event-contracts.js';
import { EventProcessorService } from './event-processor.service.js';
import {
  assertEventTopology,
  eventTransportOptions,
  type EventTransportOptions,
} from './event-topology.js';

/** Confirmed, mandatory transfer. Never acknowledge a message lost during retry/DLQ routing. */
export function transferEvent(
  channel: ConfirmChannel,
  destination: string,
  message: ConsumeMessage,
  headers: Record<string, string | number>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const messageId = randomUUID();
    const onReturn = (returned: Message) => {
      if (returned.properties.messageId === messageId)
        finish(new Error('UNROUTABLE_EVENT_TRANSFER'));
    };
    const onClose = () => finish(new Error('EVENT_CHANNEL_CLOSED'));
    const timer = setTimeout(
      () => finish(new Error('EVENT_CONFIRM_TIMEOUT')),
      10000,
    );
    const finish = (error?: Error | null) => {
      clearTimeout(timer);
      channel.removeListener('return', onReturn);
      channel.removeListener('close', onClose);
      if (error) reject(error);
      else resolve();
    };
    channel.on('return', onReturn);
    channel.on('close', onClose);
    try {
      channel.sendToQueue(
        destination,
        message.content,
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          messageId,
          headers,
        },
        finish,
      );
    } catch {
      finish(new Error('EVENT_TRANSFER_FAILED'));
    }
  });
}

@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private connection?: AmqpConnectionManager;
  private wrapper?: ChannelWrapper;
  private options?: EventTransportOptions;
  private stopping = false;
  private reconnectTimer?: NodeJS.Timeout;
  private currentChannel?: ConfirmChannel;
  private readonly inFlight = new Set<Promise<void>>();
  private consumer?: { channel: ConfirmChannel; tag: string };

  constructor(
    private readonly processor: EventProcessorService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('NOTIFICATION_EVENTS_ENABLED') === 'false')
      return;
    this.options = eventTransportOptions();
    this.connection = connect([this.options.url], {
      reconnectTimeInSeconds: 5,
    });
    this.connection.on('disconnect', () =>
      this.logger.warn({
        consumer: 'notification-events',
        status: 'disconnected',
        errorCode: 'BROKER_UNAVAILABLE',
      }),
    );
    let ready!: () => void;
    let startupFailed!: (error: Error) => void;
    const consumerReady = new Promise<void>((resolve, reject) => {
      ready = resolve;
      startupFailed = reject;
    });
    this.wrapper = this.connection.createChannel({
      name: 'notification-events',
      setup: async (channel: ConfirmChannel) => {
        if (this.stopping) return;
        clearTimeout(this.reconnectTimer);
        this.currentChannel = channel;
        channel.on('close', () => {
          if (this.stopping || this.currentChannel !== channel) return;
          clearTimeout(this.reconnectTimer);
          // The installed ChannelWrapper waits for a CONNECTION reconnect after
          // channel close. Force that reconnect with backoff on channel-only loss.
          this.reconnectTimer = setTimeout(() => {
            if (!this.stopping && this.currentChannel === channel)
              this.connection?.reconnect();
          }, 5000);
        });
        await assertEventTopology(channel, this.options!);
        channel.setMaxListeners(this.options!.prefetch * 3 + 10);
        const { consumerTag } = await channel.consume(
          this.options!.queue,
          (message) => {
            if (this.stopping) return;
            if (!message) {
              void channel.close().catch(() => undefined);
              return;
            }
            const work = this.handle(channel, message, this.options!);
            this.inFlight.add(work);
            void work.finally(() => this.inFlight.delete(work));
          },
          { noAck: false },
        );
        this.consumer = { channel, tag: consumerTag };
        ready();
      },
    });
    this.wrapper.on('error', () => {
      startupFailed(new Error('BROKER_TOPOLOGY_ERROR'));
      this.logger.error({
        consumer: 'notification-events',
        status: 'setup_failed',
        errorCode: 'BROKER_TOPOLOGY_ERROR',
      });
    });
    let startupTimer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        consumerReady,
        new Promise<never>((_, reject) => {
          startupTimer = setTimeout(
            () => reject(new Error('BROKER_STARTUP_TIMEOUT')),
            15000,
          );
        }),
      ]);
    } catch {
      await this.onModuleDestroy();
      throw new Error('NOTIFICATION_BROKER_STARTUP_FAILED');
    } finally {
      clearTimeout(startupTimer);
    }
  }

  async handle(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    options: EventTransportOptions,
  ): Promise<void> {
    const startedAt = Date.now();
    let event: NotificationEvent | undefined;
    try {
      if (message.content.length > MAX_EVENT_BYTES)
        throw new PermanentEventError('EVENT_TOO_LARGE');
      let input: unknown;
      try {
        input = JSON.parse(message.content.toString('utf8'));
      } catch {
        throw new PermanentEventError('INVALID_JSON');
      }
      const routingKey =
        message.fields.routingKey === options.queue
          ? (message.properties.headers?.['x-notification-routing-key'] as
              string | undefined)
          : message.fields.routingKey;
      event = validateNotificationEvent(input, routingKey);
      const result = await this.processor.process(event);
      // process resolves only after PostgreSQL has committed.
      channel.ack(message);
      this.logger.log({
        consumer: 'notification-events',
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        ...result,
        errorCode: null,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const permanent = error instanceof PermanentEventError;
      const errorCode = permanent ? error.code : 'EVENT_PROCESSING_FAILED';
      const value: unknown =
        message.properties.headers?.['x-notification-attempt'];
      const attempt =
        typeof value === 'number' && Number.isInteger(value) && value >= 0
          ? value
          : 0;
      const exhausted = attempt >= options.retryDelays.length;
      const destination =
        permanent || exhausted
          ? `${options.queue}.dlq`
          : `${options.queue}.retry.${attempt + 1}`;
      try {
        await transferEvent(channel, destination, message, {
          'x-notification-attempt': attempt + 1,
          'x-notification-error-code': errorCode,
          'x-notification-routing-key': event?.eventType ?? 'invalid',
        });
        channel.ack(message);
        this.logger.warn({
          consumer: 'notification-events',
          eventId: event?.eventId,
          eventType: event?.eventType,
          correlationId: event?.correlationId,
          status: permanent || exhausted ? 'dead_lettered' : 'retry_scheduled',
          attempt,
          recipientCount: 0,
          notificationCount: 0,
          errorCode,
          durationMs: Date.now() - startedAt,
        });
      } catch {
        // Leave unacked and close the original delivery channel. Broker redelivery
        // is bounded by the quorum queue delivery-limit even across process crashes.
        this.logger.error({
          consumer: 'notification-events',
          eventId: event?.eventId,
          eventType: event?.eventType,
          status: 'transfer_failed',
          errorCode: 'EVENT_TRANSFER_FAILED',
          recipientCount: 0,
          notificationCount: 0,
          durationMs: Date.now() - startedAt,
        });
        try {
          await channel.close();
        } catch {
          /* already disconnected */
        }
      }
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    if (this.consumer) {
      try {
        await this.consumer.channel.cancel(this.consumer.tag);
      } catch {
        /* disconnected */
      }
    }
    await Promise.allSettled(this.inFlight);
    await this.wrapper?.close();
    await this.connection?.close();
  }
}
