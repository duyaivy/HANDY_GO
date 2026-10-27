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

  constructor(
    private readonly repository: OrderOutboxRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    // Poll every 3 seconds for pending outbox events
    this.timer = setInterval(() => {
      void this.publishPendingEvents();
    }, 3000);
    this.timer.unref?.();
    this.logger.log('Order Outbox Publisher initialized (polling interval: 3s)');
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
          await this.rabbitmq.emit(event.eventType, event.payload);
          await this.repository.markPublished(event.id, new Date());
          publishedCount++;
          this.logger.debug(
            `Published outbox event ${event.eventType} (${event.id})`,
          );
        } catch (error) {
          const newRetryCount = event.retryCount + 1;
          const errorMessage =
            (error as Error).message || 'RabbitMQ publish failed';
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
                `DLQ routing failed: ${(dlqErr as Error).message}`,
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

      return publishedCount;
    } finally {
      this.isProcessing = false;
    }
  }
}
