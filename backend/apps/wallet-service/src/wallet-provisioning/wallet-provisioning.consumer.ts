import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@app/common';
import { RabbitMQContextService } from '@app/rabbitmq';
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
  constructor(
    private readonly service: WalletProvisioningService,
    private readonly rmqContext: RabbitMQContextService,
  ) {}

  @EventPattern(EVENT_PATTERNS.USER_REGISTERED)
  async onUserRegistered(
    @Payload() event: UserRegisteredEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    if (
      !event?.eventId ||
      event.eventVersion !== 3 ||
      !event.data?.userId ||
      !event.data.accountId
    ) {
      this.rmqContext.ack(context);
      return;
    }

    try {
      await this.service.provisionFromEvent(
        event.data.userId,
        event.eventId,
        EVENT_PATTERNS.USER_REGISTERED,
      );
      this.rmqContext.ack(context);
    } catch {
      this.rmqContext.nack(context, true);
    }
  }
}
