import { PollBackoff, safeOutboxError } from '@app/common';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { RabbitMQService } from '@app/rabbitmq';
import { OrderOutboxRepository } from './order-outbox.repository.js';

@Injectable()
export class OrderOutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrderOutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly backoff = new PollBackoff();
  private stopped = false;

  constructor(
    private readonly repository: OrderOutboxRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    // Poll every 3 seconds for pending outbox events
    this.timer = setInterval(() => {
      void this.publishPendingEvents();
    }, 3000);
    this.timer.unref?.();
    this.logger.log('Order Outbox Publisher initialized (polling interval: 3s)');
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async triggerPublish(): Promise<void> {
    await this.publishPendingEvents();
  }

  async publishPendingEvents(): Promise<number> {
    if (this.isProcessing || this.stopped || !this.backoff.ready()) {
      return 0;
    }
    this.isProcessing = true;

    try {
      const now = new Date();
      const pendingEvents = await this.repository.findPendingEvents(20, now);
      let publishedCount = 0;

      for (const event of pendingEvents) {
        if (event.status === 'dlq_retry') {
          let dlqDelivered = false;
          try {
            await this.rabbitmq.emit('handy-go.dlq', {
              failedEventId: event.id,
              eventType: event.eventType,
              payload: event.payload,
              retries: event.retryCount,
              failedAt: new Date().toISOString(),
              error: event.lastError,
            });

            dlqDelivered = true;
            await this.repository.markFailed(
              event.id,
              'Routing to DLQ completed after retry',
              event.retryCount,
            );
          } catch (dlqErr) {
            if (dlqDelivered) throw dlqErr;
            this.logger.error(
              `Retry publishing event ${event.id} to DLQ failed: ${safeOutboxError(dlqErr)}`,
            );
            await this.repository.scheduleDlqRetry(
              event.id,
              new Date(Date.now() + 10000),
              `DLQ retry failed: ${safeOutboxError(dlqErr)}`,
              event.retryCount,
            );
          }
          continue;
        }

        // status === 'pending'
        let delivered = false;
        try {
          const envelope = this.buildEnvelope(event);
          await this.rabbitmq.emit(event.eventType, envelope);
          delivered = true;
          await this.repository.markPublished(event.id, new Date());
          publishedCount++;
          this.logger.debug(
            `Published outbox event ${event.eventType} (${event.id})`,
          );
        } catch (error) {
          if (delivered) throw error;
          const newRetryCount = event.retryCount + 1;
          const errorMessage =
            safeOutboxError(error);
          this.logger.error(
            `Error publishing outbox event ${event.id} (attempt ${newRetryCount}): ${errorMessage}`,
          );

          if (newRetryCount >= 5) {
            try {
              await this.rabbitmq.emit('handy-go.dlq', {
                failedEventId: event.id,
                eventType: event.eventType,
                payload: event.payload,
                retries: newRetryCount,
                failedAt: new Date().toISOString(),
                error: errorMessage,
              });

              await this.repository.markFailed(
                event.id,
                `Max retries exceeded (5). Routed to DLQ: ${errorMessage}`,
                newRetryCount,
              );
            } catch (dlqErr) {
              await this.repository.scheduleDlqRetry(
                event.id,
                new Date(Date.now() + 10000),
                `DLQ routing failed: ${safeOutboxError(dlqErr)}`,
                newRetryCount,
              );
            }
          } else {
            const backoffSeconds = Math.pow(2, newRetryCount) * 5;
            const nextRetry = new Date(Date.now() + backoffSeconds * 1000);
            await this.repository.scheduleRetry(
              event.id,
              nextRetry,
              newRetryCount,
              errorMessage,
            );
          }
        }
      }

      this.backoff.reset();
      return publishedCount;
    } catch (error) {
      const delay = this.backoff.fail();
      this.logger.error(`Outbox cycle failed: ${safeOutboxError(error)}; retry in ${delay}ms; check database budget and broker health. Durable events remain pending.`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  buildEnvelope(event: {
    id: string;
    eventType: string;
    eventVersion?: number;
    payload: any;
    createdAt?: Date | string;
  }): Record<string, unknown> {
    const payloadObj =
      typeof event.payload === 'string'
        ? JSON.parse(event.payload)
        : event.payload && typeof event.payload === 'object'
          ? (event.payload as Record<string, unknown>)
          : {};

    const occurredAt = event.createdAt
      ? new Date(event.createdAt).toISOString()
      : new Date().toISOString();

    return {
      ...payloadObj,
      eventId: event.id,
      eventType: event.eventType,
      eventVersion: event.eventVersion ?? 1,
      source: 'order-service',
      producer: 'order-service',
      occurredAt,
      payload: payloadObj,
      data: payloadObj,
    };
  }
}
