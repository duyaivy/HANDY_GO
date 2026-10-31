import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import amqp, {
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { SseService } from './sse.service.js';
import type { FanoutEventPayload } from './sse.interfaces.js';
import crypto from 'node:crypto';

export const EVENTS_TOPIC_EXCHANGE =
  process.env.RABBITMQ_EXCHANGE || 'handy-go.events';
export const BIDDING_SSE_FANOUT_EXCHANGE = EVENTS_TOPIC_EXCHANGE;
export const SSE_TOPIC_ROUTING_PATTERNS = [
  'bid.#',
  'bidding.round.#',
  'matching.#',
] as const;

@Injectable()
export class SseEventBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SseEventBridgeService.name);

  private connection: AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;
  private isDegraded = true;

  // Short-lived deduplication cache (60 seconds) to prevent duplicate event dispatches
  private readonly recentEventIds = new Map<string, number>();

  constructor(
    private readonly sseService: SseService,
    private readonly config: ConfigService,
  ) {}

  public get isBridgeDegraded(): boolean {
    return this.isDegraded;
  }

  async onModuleInit(): Promise<void> {
    const isTest = process.env.NODE_ENV === 'test';
    const rabbitMqUrl =
      this.config.get('RABBITMQ_URL') ||
      'amqp://handygo:handygo@localhost:5672';

    if (isTest && !process.env.RABBITMQ_URL) {
      this.isDegraded = true;
      this.logger.log(
        'Test environment detected without explicit RABBITMQ_URL. RabbitMQ broker connection skipped. SSE bridge marked degraded.',
      );
      return;
    }

    try {
      this.connection = amqp.connect([rabbitMqUrl]);

      this.connection.on('connect', () => {
        this.isDegraded = false;
        this.logger.log('Connected to RabbitMQ for SSE domain event bridge.');
      });

      this.connection.on('disconnect', (params: { err: Error }) => {
        this.isDegraded = true;
        this.logger.warn(
          `Disconnected from RabbitMQ SSE domain event bridge: ${params.err?.message}. Bridge status is degraded. Mobile REST reconciliation will reconcile state on reconnect.`,
        );
      });

      this.channelWrapper = this.connection.createChannel({
        json: false,
        setup: async (channel: Channel) => {
          const exchange =
            this.config.get('RABBITMQ_EXCHANGE') || EVENTS_TOPIC_EXCHANGE;

          // 1. Assert standard topic exchange
          await channel.assertExchange(exchange, 'topic', {
            durable: true,
          });

          // 2. Assert exclusive, auto-delete queue for this bidding-service replica
          const q = await channel.assertQueue('', {
            exclusive: true,
            autoDelete: true,
          });

          // 3. Bind queue directly to standard topic exchange with routing patterns
          for (const pattern of SSE_TOPIC_ROUTING_PATTERNS) {
            await channel.bindQueue(q.queue, exchange, pattern);
          }

          this.logger.log(
            `Exclusive SSE queue ${q.queue} bound to ${exchange} with patterns: ${SSE_TOPIC_ROUTING_PATTERNS.join(', ')}`,
          );

          // 4. Consume messages
          await channel.consume(
            q.queue,
            (msg: ConsumeMessage | null) => {
              if (msg) {
                try {
                  const content = JSON.parse(msg.content.toString());
                  this.handleFanoutMessage(content);
                } catch (parseErr) {
                  this.logger.error(
                    `Failed to parse SSE domain event message: ${(parseErr as Error).message}`,
                  );
                }
              }
            },
            { noAck: true },
          );
        },
      });
    } catch (err) {
      this.isDegraded = true;
      this.logger.error(
        `Failed to initialize RabbitMQ SSE Event Bridge: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channelWrapper) {
        await this.channelWrapper.close();
        this.channelWrapper = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (err) {
      this.logger.warn(
        `Error during SSE bridge shutdown: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Safe fanout dispatch: authoritative events are published via OutboxPublisherService.
   * Unsafe local in-memory fallback is strictly removed: if broker is disconnected/degraded,
   * an explicit warning is logged and client REST reconciliation reconciles state on reconnect.
   */
  async publishToFanout(event: FanoutEventPayload): Promise<void> {
    if (this.isDegraded || !this.channelWrapper) {
      this.logger.warn(
        `RabbitMQ SSE broker is degraded or disconnected. Event ${event.eventType} for request ${event.requestId} cannot be published to fanout. Local fallback omitted to avoid silent false-positives. Mobile REST reconciliation reconciles state.`,
      );
      return;
    }

    const exchange =
      this.config.get('RABBITMQ_EXCHANGE') || EVENTS_TOPIC_EXCHANGE;
    const rawBuffer = Buffer.from(JSON.stringify(event));

    try {
      await this.channelWrapper.publish(exchange, event.eventType, rawBuffer);
    } catch (err) {
      this.isDegraded = true;
      this.logger.error(
        `Failed to publish event ${event.eventType} to ${exchange}: ${(err as Error).message}. Bridge marked degraded.`,
      );
    }
  }

  /**
   * Processes a message received from the fanout exchange and dispatches to local SSE clients.
   */
  handleFanoutMessage(message: any): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    // Nest ClientRMQ wraps Outbox envelopes in { pattern, data: envelope }.
    // Matching also publishes raw envelopes, so unwrap only the transport packet.
    const envelope =
      typeof message.pattern === 'string' &&
      message.data &&
      typeof message.data === 'object' &&
      typeof message.data.eventType === 'string'
        ? message.data
        : message;
    const eventType: string = envelope.eventType || message.pattern || '';
    const payload = envelope.payload || envelope.data || envelope;
    const requestId: string =
      payload.requestId ||
      payload.serviceRequestId ||
      envelope.requestId ||
      envelope.serviceRequestId;

    if (!requestId) {
      this.logger.warn(`Fanout message missing requestId (${eventType})`);
      return;
    }

    const eventId: string =
      envelope.eventId || payload.eventId || crypto.randomUUID();
    const occurredAt: string =
      envelope.occurredAt || payload.occurredAt || new Date().toISOString();

    // Deduplication check
    this.cleanExpiredEventIds();
    if (this.recentEventIds.has(eventId)) {
      return;
    }
    this.recentEventIds.set(eventId, Date.now() + 60000);

    this.logger.debug({
      event: 'sse_domain_event_received',
      eventType,
      eventId,
      requestId,
      subscribers: this.sseService.getClientCount(requestId),
    });

    // Map domain event to SSE event frame
    switch (eventType) {
      // 1. Bid Lifecycle Events -> bid.changed
      case 'bid.submitted':
        this.sseService.broadcastBidChanged(
          requestId,
          'submitted',
          eventId,
          occurredAt,
        );
        break;

      case 'bid.revised':
        this.sseService.broadcastBidChanged(
          requestId,
          'revised',
          eventId,
          occurredAt,
        );
        break;

      case 'bid.withdrawn':
        this.sseService.broadcastBidChanged(
          requestId,
          'withdrawn',
          eventId,
          occurredAt,
        );
        break;

      // 2. Round Lifecycle Events -> round.changed
      case 'bidding.round.opened':
      case 'round.opened':
      case 'service_request.published':
        this.sseService.broadcastRoundChanged(
          requestId,
          'opened',
          eventId,
          occurredAt,
        );
        break;

      case 'bidding.round.closed':
      case 'round.closed':
      case 'service_request.bidding_closed':
        this.sseService.broadcastRoundChanged(
          requestId,
          'closed',
          eventId,
          occurredAt,
        );
        break;

      case 'bidding.round.extended':
      case 'round.extended':
        this.sseService.broadcastRoundChanged(
          requestId,
          'extended',
          eventId,
          occurredAt,
        );
        break;

      case 'bidding.round.finalized':
      case 'round.finalized':
      case 'order.created':
        this.sseService.broadcastRoundChanged(
          requestId,
          'finalized',
          eventId,
          occurredAt,
        );
        break;

      case 'bidding.round.cancelled':
      case 'round.cancelled':
      case 'service_request.cancelled':
        this.sseService.broadcastRoundChanged(
          requestId,
          'cancelled',
          eventId,
          occurredAt,
        );
        break;

      case 'bidding.round.no_bid':
      case 'round.no_bid':
        this.sseService.broadcastRoundChanged(
          requestId,
          'no_bid',
          eventId,
          occurredAt,
        );
        break;

      // 3. AI Matching Events -> matching.changed
      case 'matching.completed':
        this.sseService.broadcastMatchingChanged(
          requestId,
          'completed',
          eventId,
          occurredAt,
        );
        break;

      case 'matching.failed':
        this.sseService.broadcastMatchingChanged(
          requestId,
          'failed',
          eventId,
          occurredAt,
        );
        break;

      default:
        // Other events can be ignored or logged at debug
        this.logger.debug(`Ignored unmapped fanout eventType: ${eventType}`);
        break;
    }
  }

  private cleanExpiredEventIds(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.recentEventIds.entries()) {
      if (now > expiresAt) {
        this.recentEventIds.delete(id);
      }
    }
  }
}
