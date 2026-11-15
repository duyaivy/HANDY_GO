import {
  connect,
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { Logger } from '@nestjs/common';
import { MessageService } from './message.service.js';
const lifecycle = new Map([
  ['bid.submitted', 'bidding-service'],
  ['bid.revised', 'bidding-service'],
  ['bid.withdrawn', 'bidding-service'],
  ['service_request.cancelled', 'order-service'],
  ['order.created', 'order-service'],
  ['order.status.changed', 'order-service'],
  ['order.completed', 'order-service'],
  ['order.cancelled', 'order-service'],
]);
/** Confirmed publication and durable inbox. Broker downtime never participates in the send transaction. */
export class MessageBroker {
  private connection?: AmqpConnectionManager;
  private publisher?: ChannelWrapper;
  private publisherChannel?: ConfirmChannel;
  private consumer?: ChannelWrapper;
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger('MessageBroker');
  private readonly queue =
    process.env.MESSAGE_EVENT_QUEUE?.trim() || 'handygo.message.events.v1';
  private readonly exchange =
    process.env.RABBITMQ_EXCHANGE?.trim() || 'handy-go.events';
  constructor(
    private readonly messages: MessageService,
    private readonly url: string,
  ) {}
  start() {
    this.connection = connect([this.url], { reconnectTimeInSeconds: 5 });
    this.connection.on('disconnect', () =>
      this.logger.warn('BROKER_UNAVAILABLE; durable outbox retained'),
    );
    this.publisher = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.exchange, 'topic', { durable: true });
        this.publisherChannel = channel;
        channel.once('close', () => {
          if (this.publisherChannel === channel)
            this.publisherChannel = undefined;
        });
      },
    });
    this.publisher.on('error', () =>
      this.logger.warn('BROKER_PUBLISHER_UNAVAILABLE'),
    );
    this.consumer = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.exchange, 'topic', { durable: true });
        const quorum = {
          'x-queue-type': 'quorum',
          'x-overflow': 'reject-publish',
        };
        await channel.assertQueue(`${this.queue}.dlq`, {
          durable: true,
          arguments: quorum,
        });
        await channel.assertQueue(this.queue, {
          durable: true,
          arguments: {
            ...quorum,
            'x-dead-letter-strategy': 'at-least-once',
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': `${this.queue}.dlq`,
            'x-delivery-limit': 20,
          },
        });
        for (let attempt = 1; attempt <= 10; attempt++)
          await channel.assertQueue(`${this.queue}.retry.${attempt}`, {
            durable: true,
            arguments: {
              ...quorum,
              'x-message-ttl': Math.min(60000, 1000 * 2 ** (attempt - 1)),
              'x-dead-letter-strategy': 'at-least-once',
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': this.queue,
            },
          });
        for (const event of lifecycle.keys())
          await channel.bindQueue(this.queue, this.exchange, event);
        await channel.prefetch(5);
        await channel.consume(
          this.queue,
          (message) => {
            if (message)
              void this.consume(channel, message).catch(() => {
                try {
                  channel.nack(message, false, true);
                } catch {
                  /* channel loss retains delivery */
                }
              });
          },
          { noAck: false },
        );
      },
    });
    this.consumer.on('error', () =>
      this.logger.warn('BROKER_CONSUMER_UNAVAILABLE'),
    );
    this.timer = setInterval(() => {
      void this.publishPending();
    }, 3000);
    this.timer.unref();
  }
  async publishPending() {
    if (this.running || !this.publisher || !this.connection?.isConnected())
      return 0;
    this.running = true;
    let count = 0;
    try {
      const rows = await this.messages.db.outboxEvent.findMany({
        where: { status: 'pending', nextRetryAt: { lte: new Date() } },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });
      for (const row of rows) {
        try {
          await this.confirm(row.id, row.eventType, row.payload);
          await this.messages.db.outboxEvent.update({
            where: { id: row.id },
            data: { status: 'published', publishedAt: new Date() },
          });
          count++;
        } catch {
          const attempts = row.retryCount + 1;
          // Retain pending rows even after prolonged outage. Alert metadata is safe and replay identity remains unchanged.
          await this.messages.db.outboxEvent.update({
            where: { id: row.id },
            data: {
              retryCount: attempts,
              nextRetryAt: new Date(
                Date.now() + Math.min(60000, 1000 * 2 ** Math.min(attempts, 6)),
              ),
              lastError: 'BROKER_UNAVAILABLE',
            },
          });
          this.logger.warn({
            eventId: row.id,
            errorCode: 'BROKER_UNAVAILABLE',
            attempt: attempts,
          });
        }
      }
    } catch {
      this.logger.warn('OUTBOX_POLL_UNAVAILABLE; durable rows retained');
    } finally {
      this.running = false;
    }
    return count;
  }
  private confirm(eventId: string, type: string, payload: unknown) {
    const channel = this.publisherChannel;
    if (!channel) return Promise.reject(new Error('BROKER_UNAVAILABLE'));
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel.removeListener('return', returned);
        channel.removeListener('close', closed);
        error ? reject(error) : resolve();
      };
      const returned = (message: ConsumeMessage) => {
        if (message.properties.messageId === eventId)
          finish(new Error('BROKER_UNROUTABLE'));
      };
      const closed = () => finish(new Error('BROKER_UNAVAILABLE'));
      const timer = setTimeout(
        () => finish(new Error('BROKER_CONFIRM_TIMEOUT')),
        5000,
      );
      timer.unref();
      channel.on('return', returned);
      channel.on('close', closed);
      try {
        channel.publish(
          this.exchange,
          type,
          Buffer.from(JSON.stringify(payload)),
          {
            persistent: true,
            mandatory: true,
            messageId: eventId,
            contentType: 'application/json',
          },
          finish,
        );
      } catch {
        finish(new Error('BROKER_UNAVAILABLE'));
      }
    });
  }
  private transfer(
    channel: ConfirmChannel,
    destination: string,
    message: ConsumeMessage,
    attempt: number,
  ) {
    return new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        destination,
        message.content,
        {
          persistent: true,
          headers: {
            ...message.properties.headers,
            'x-message-attempt': attempt,
          },
          messageId: message.properties.messageId,
          contentType: 'application/json',
        },
        (error) => (error ? reject(error) : resolve()),
      );
    });
  }
  private async consume(channel: ConfirmChannel, message: ConsumeMessage) {
    const attempt = Number(
      message.properties.headers?.['x-message-attempt'] ?? 0,
    );
    let envelope: Record<string, any>, type: string;
    try {
      if (message.content.length > 65536) throw new Error();
      const packet = JSON.parse(message.content.toString());
      envelope = packet.pattern ? packet.data : packet;
      type = envelope.eventType ?? message.fields.routingKey ?? packet.pattern;
      const id =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
      const data = envelope.data ?? envelope.payload;
      if (
        !lifecycle.has(type) ||
        lifecycle.get(type) !== (envelope.producer ?? envelope.source) ||
        envelope.eventVersion !== 1 ||
        typeof envelope.eventId !== 'string' ||
        !id.test(envelope.eventId) ||
        !Number.isFinite(Date.parse(envelope.occurredAt)) ||
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        (packet.pattern && packet.pattern !== type) ||
        (message.fields.routingKey && message.fields.routingKey !== type)
      )
        throw new Error();
      if (
        type.startsWith('bid.') &&
        (!id.test(data.bidId) ||
          !id.test(data.workerId) ||
          !id.test(data.requestId ?? data.serviceRequestId))
      )
        throw new Error();
      if (
        type === 'service_request.cancelled' &&
        !id.test(data.requestId ?? data.serviceRequestId)
      )
        throw new Error();
      if (
        type.startsWith('order.') &&
        (!id.test(data.orderId) ||
          !id.test(data.customerId ?? data.customerUserId) ||
          !id.test(data.workerId ?? data.workerUserId))
      )
        throw new Error();
      envelope.data = data;
    } catch {
      await this.transfer(channel, `${this.queue}.dlq`, message, attempt);
      channel.ack(message);
      return;
    }
    try {
      await this.messages.invalidate(envelope.eventId, type, envelope.data);
      channel.ack(message);
    } catch {
      await this.transfer(
        channel,
        attempt >= 10
          ? `${this.queue}.dlq`
          : `${this.queue}.retry.${attempt + 1}`,
        message,
        attempt + 1,
      );
      channel.ack(message);
    }
  }
  async close() {
    if (this.timer) clearInterval(this.timer);
    await this.consumer?.close();
    await this.publisher?.close();
    await this.connection?.close();
  }
}
