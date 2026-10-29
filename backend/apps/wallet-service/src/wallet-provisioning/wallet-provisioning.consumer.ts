import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { AppException, EVENT_PATTERNS } from '@app/common';
import { ConsumerRetryService } from '../common/messaging/consumer-retry.service.js';
import { WalletProvisioningService } from './wallet-provisioning.service.js';

interface UserRegisteredEvent {
  eventId: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  data: { userId: string; accountId: string };
}

@Controller()
export class WalletProvisioningConsumer {
  private readonly logger = new Logger(WalletProvisioningConsumer.name);

  constructor(
    private readonly service: WalletProvisioningService,
    private readonly retry: ConsumerRetryService,
  ) {}

  @EventPattern(EVENT_PATTERNS.USER_REGISTERED)
  async onUserRegistered(
    @Payload() event: UserRegisteredEvent,
    @Ctx() context: unknown,
  ): Promise<void> {
    const rmqContext = context as RmqContext;

    if (
      !event?.eventId ||
      event.eventVersion !== 3 ||
      !event.data?.userId ||
      !event.data.accountId
    ) {
      await this.service.quarantine(event, 'invalid user.registered envelope');
      await this.retry.deadLetter(rmqContext, 'invalid user.registered envelope');
      return;
    }

    try {
      await this.service.provisionFromEvent(
        event.data.userId,
        event.eventId,
        EVENT_PATTERNS.USER_REGISTERED,
      );
      rmqContext.getChannelRef().ack(rmqContext.getMessage());
    } catch (error) {
      const isPermanent = this.isPermanentError(error);
      if (isPermanent) {
        this.logger.warn({ error, eventId: event.eventId }, 'Permanent error provisioning wallet — event quarantined');
        await this.service.quarantine(event, 'permanent provisioning error', error);
        await this.retry.deadLetter(rmqContext, 'permanent provisioning error');
      } else {
        this.logger.error({ error, eventId: event.eventId }, 'Transient error provisioning wallet — scheduling retry');
        const outcome = await this.retry.retryOrDeadLetter(rmqContext, (error as Error).message);
        if (outcome.action === 'dead_letter') {
          await this.service.quarantine(event, 'retries exhausted', error);
        }
      }
    }
  }

  private isPermanentError(error: unknown): boolean {
    if (error instanceof AppException) {
      const status = error.getStatus();
      // 4xx except 429 (rate limit) are permanent
      return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
    }
    return false;
  }
}
