import { PollBackoff, safeOutboxError } from '@app/common';
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
  private readonly backoff = new PollBackoff();
  private stopped = false;

  constructor(
    private readonly repository: MatchingOutboxRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => {
        void this.publishPendingEvents();
      }, 3000);
      this.timer.unref?.();
    }
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
    if (this.isProcessing || this.stopped || !this.backoff.ready()) return 0;
    this.isProcessing = true;

    try {
      const pendingEvents = await this.repository.findPendingEvents(20);
      let publishedCount = 0;

      for (const event of pendingEvents) {
        let delivered = false;
        try {
          await this.rabbitmq.emit(event.eventType, event.payload);
          delivered = true;
          await this.repository.markPublished(event.id);
          publishedCount++;
        } catch (error) {
          if (delivered) throw error;
          const attempts = event.publishAttempts + 1;
          const msg = safeOutboxError(error);
          this.logger.error(
            `Failed to publish outbox event ${event.id} (${event.eventType}, attempt ${attempts}): ${msg}`,
          );

          await this.repository.incrementPublishAttempts(event.id);
          throw error;

          // Keep the original durable outbox row pending. A routing-key emission is
          // not proof that a DLQ exists; never mark an undelivered event published.
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
