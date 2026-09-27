import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { RabbitMQService } from '@app/rabbitmq';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly db: AuthPrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'test') {
      // Poll every 3 seconds for pending outbox events
      this.timer = setInterval(() => {
        void this.publishPendingEvents();
      }, 3000);
    }
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
      const pendingEvents = await this.db.outboxEvent.findMany({
        where: {
          status: { in: ['pending', 'dlq_retry'] },
          nextRetryAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

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

            await this.db.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: 'failed',
                lastError: `Routing to DLQ completed after retry`,
              },
            });
          } catch (dlqErr) {
            this.logger.error(
              `Retry publishing event ${event.id} to DLQ failed: ${(dlqErr as Error).message}`,
            );
            await this.db.outboxEvent.update({
              where: { id: event.id },
              data: {
                nextRetryAt: new Date(Date.now() + 10000),
                lastError: `DLQ retry failed: ${(dlqErr as Error).message}`,
              },
            });
          }
          continue;
        }

        // status === 'pending'
        try {
          await this.rabbitmq.emit(event.eventType, event.payload);

          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'published',
              publishedAt: new Date(),
            },
          });
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

              await this.db.outboxEvent.update({
                where: { id: event.id },
                data: {
                  status: 'failed',
                  retryCount: newRetryCount,
                  lastError: errorMessage,
                },
              });
            } catch (dlqErr) {
              this.logger.error(
                `Failed to publish event ${event.id} to DLQ: ${(dlqErr as Error).message}`,
              );
              // Do NOT mark completed or drop event! Keep status as dlq_retry
              await this.db.outboxEvent.update({
                where: { id: event.id },
                data: {
                  status: 'dlq_retry',
                  retryCount: newRetryCount,
                  nextRetryAt: new Date(Date.now() + 5000),
                  lastError: `DLQ publish failed: ${(dlqErr as Error).message}`,
                },
              });
            }
          } else {
            // Exponential backoff: 2s, 4s, 8s, 16s
            const backoffSeconds = Math.pow(2, newRetryCount);
            const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
            await this.db.outboxEvent.update({
              where: { id: event.id },
              data: {
                retryCount: newRetryCount,
                nextRetryAt,
                lastError: errorMessage,
              },
            });
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
