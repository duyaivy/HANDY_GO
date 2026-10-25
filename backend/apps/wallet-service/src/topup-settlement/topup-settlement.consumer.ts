import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { RabbitMQContextService } from '@app/rabbitmq';
import { TopupSettlementService } from './topup-settlement.service.js';
import { PaymentTopupSucceededDto } from './dto/payment-topup-succeeded.dto.js';

@Controller()
export class TopupSettlementConsumer {
  constructor(
    private readonly service: TopupSettlementService,
    private readonly rmqContext: RabbitMQContextService,
  ) {}

  @EventPattern('payment.topup.succeeded')
  async onTopupSucceeded(
    @Payload() event: PaymentTopupSucceededDto,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    if (
      !event ||
      typeof event.userId !== 'string' ||
      typeof event.paymentId !== 'string' ||
      typeof event.amount !== 'string' ||
      !/^[1-9]\d*$/.test(event.amount) ||
      typeof event.idempotencyKey !== 'string'
    ) {
      this.rmqContext.ack(context);
      return;
    }

    try {
      await this.service.settle(event);
      this.rmqContext.ack(context);
    } catch {
      this.rmqContext.nack(context, true);
    }
  }
}
