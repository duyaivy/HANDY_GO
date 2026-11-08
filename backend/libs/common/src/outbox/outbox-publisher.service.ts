import { PollBackoff, safeOutboxError } from './poll-backoff.js';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { RabbitMQService } from '@app/rabbitmq';
import { OutboxRepository } from './outbox.repository.js';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly backoff = new PollBackoff();
  private stopped = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    // Poll every 3 seconds for pending outbox events
    this.timer = setInterval(() => {
      void this.publishPendingEvents();
    }, 3000);
    this.timer.unref?.();
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
          // Retry DLQ publish
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
          const payloadObj =
            event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
              ? (event.payload as Record<string, any>)
              : { value: event.payload };

          const aggType = event.aggregateType || 'event';
          const defaultSource =
            aggType === 'bid' || aggType === 'bidding_round'
              ? 'bidding-service'
              : `${aggType}-service`;

          const occurredAt =
            payloadObj.occurredAt ||
            (event.createdAt
              ? new Date(event.createdAt).toISOString()
              : new Date().toISOString());

          // Check if payload is ALREADY a structured DomainEvent/Envelope (e.g. from auth-service, user-trust-service)
          const isAlreadyEnveloped = Boolean(
            payloadObj &&
              typeof payloadObj === 'object' &&
              payloadObj.data &&
              typeof payloadObj.data === 'object' &&
              !Array.isArray(payloadObj.data),
          );

          let envelope: Record<string, any>;

          if (isAlreadyEnveloped) {
            // Preserve the existing DomainEvent envelope structure without double wrapping data
            const producer =
              payloadObj.producer ||
              payloadObj.source ||
              payloadObj.sourceService ||
              defaultSource;

            envelope = {
              ...payloadObj,
              eventId: payloadObj.eventId || event.id,
              eventType: payloadObj.eventType || event.eventType,
              eventVersion: payloadObj.eventVersion || event.eventVersion || 1,
              producer,
              source: producer,
              occurredAt: payloadObj.occurredAt || occurredAt,
              data: payloadObj.data,
              payload: payloadObj.data,
            };
          } else {
            // Raw business payload (e.g. from bidding-service): wrap into standard CloudEvent envelope
            const source =
              payloadObj.source || payloadObj.producer || defaultSource;

            envelope = {
              eventId: event.id,
              eventType: event.eventType,
              eventVersion: event.eventVersion || 1,
              source,
              producer: source,
              occurredAt,
              data: payloadObj,
              payload: payloadObj,
            };
          }

          await this.rabbitmq.emit(event.eventType, envelope);

          delivered = true;
          await this.repository.markPublished(event.id, new Date());
          publishedCount++;
        } catch (error) {
          if (delivered) throw error;
          const newRetryCount = event.retryCount + 1;
          const errorMessage =
            safeOutboxError(error);
          this.logger.error(
            `Error publishing event ${event.id} (attempt ${newRetryCount}): ${errorMessage}`,
          );

          if (newRetryCount >= 5) {
            // Exceeded max retries, attempt DLQ routing
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
                errorMessage,
                newRetryCount,
              );
            } catch (dlqErr) {
              this.logger.error(
                `Failed to publish event ${event.id} to DLQ: ${safeOutboxError(dlqErr)}`,
              );
              // Do NOT mark completed or drop event! Keep status as dlq_retry
              await this.repository.scheduleDlqRetry(
                event.id,
                new Date(Date.now() + 5000),
                `DLQ publish failed: ${safeOutboxError(dlqErr)}`,
                newRetryCount,
              );
            }
          } else {
            // Exponential backoff: 2s, 4s, 8s, 16s
            const backoffSeconds = Math.pow(2, newRetryCount);
            const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
            await this.repository.scheduleRetry(
              event.id,
              nextRetryAt,
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
}
