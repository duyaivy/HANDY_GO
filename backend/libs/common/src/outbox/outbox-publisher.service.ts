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

  constructor(
    private readonly repository: OutboxRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    // Poll every 3 seconds for pending outbox events
    this.timer = setInterval(() => {
      void this.publishPendingEvents();
    }, 3000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async triggerPublish(): Promise<void> {
    await this.publishPendingEvents();
  }

  async publishPendingEvents(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }
    this.isProcessing = true;

    try {
      const now = new Date();
      const pendingEvents = await this.repository.findPendingEvents(20, now);

      let publishedCount = 0;

      for (const event of pendingEvents) {
        if (event.status === 'dlq_retry') {
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

            await this.repository.markFailed(
              event.id,
              'Routing to DLQ completed after retry',
              event.retryCount,
            );
          } catch (dlqErr) {
            this.logger.error(
              `Retry publishing event ${event.id} to DLQ failed: ${(dlqErr as Error).message}`,
            );
            await this.repository.scheduleDlqRetry(
              event.id,
              new Date(Date.now() + 10000),
              `DLQ retry failed: ${(dlqErr as Error).message}`,
              event.retryCount,
            );
          }
          continue;
        }

        // status === 'pending'
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

          await this.repository.markPublished(event.id, new Date());
          publishedCount++;
        } catch (error) {
          const newRetryCount = event.retryCount + 1;
          const errorMessage =
            (error as Error).message || 'RabbitMQ publish failed';
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
                `Failed to publish event ${event.id} to DLQ: ${(dlqErr as Error).message}`,
              );
              // Do NOT mark completed or drop event! Keep status as dlq_retry
              await this.repository.scheduleDlqRetry(
                event.id,
                new Date(Date.now() + 5000),
                `DLQ publish failed: ${(dlqErr as Error).message}`,
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

      return publishedCount;
    } catch (dbError) {
      this.logger.debug(
        `Pending outbox scan skipped: ${(dbError as Error).message}`,
      );
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
