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
    @Ctx() context: unknown,
  ): Promise<void> {
    const rmqContext = context as RmqContext;

    if (
      !event ||
      typeof event.userId !== 'string' ||
      typeof event.paymentId !== 'string' ||
      typeof event.amount !== 'string' ||
      !/^[1-9]\d*$/.test(event.amount) ||
      typeof event.idempotencyKey !== 'string'
    ) {
      this.rmqContext.ack(rmqContext);
      return;
    }

    try {
      await this.service.settle(event);
      this.rmqContext.ack(rmqContext);
    } catch {
      this.rmqContext.nack(rmqContext, true);
    }
  }
}
