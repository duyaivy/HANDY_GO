import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { RabbitMQService } from '@app/rabbitmq';
import { MatchingOutboxRepository } from '../persistence/matching-outbox.repository.js';

@Injectable()
export class MatchingOutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MatchingOutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly repository: MatchingOutboxRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => {
        void this.publishPendingEvents();
      }, 3000);
      this.timer.unref?.();
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
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const pendingEvents = await this.repository.findPendingEvents(20);
      let publishedCount = 0;

      for (const event of pendingEvents) {
        try {
          await this.rabbitmq.emit(event.eventType, event.payload);
          await this.repository.markPublished(event.id);
          publishedCount++;
        } catch (error) {
          const attempts = event.publishAttempts + 1;
          const msg = (error as Error).message;
          this.logger.error(
            `Failed to publish outbox event ${event.id} (${event.eventType}, attempt ${attempts}): ${msg}`,
          );

          await this.repository.incrementPublishAttempts(event.id);

          // Keep the original durable outbox row pending. A routing-key emission is
          // not proof that a DLQ exists; never mark an undelivered event published.
        }
      }

      return publishedCount;
    } catch (err) {
      this.logger.debug(`Outbox poll cycle skipped: ${(err as Error).message}`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
