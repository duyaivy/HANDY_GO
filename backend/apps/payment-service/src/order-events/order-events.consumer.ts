import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { ORDER_CANCELLED, ORDER_COMPLETED, ORDER_CREATED } from './order-events.service.js';

@Controller()
export class OrderEventsConsumer {
  constructor(private readonly inbox: PaymentInboxService) {}

  @EventPattern(ORDER_CREATED)
  created(@Payload() payload: unknown, @Ctx() context: unknown) {
    return this.inbox.consume(ORDER_CREATED, payload, context as RmqContext);
  }

  @EventPattern(ORDER_COMPLETED)
  completed(@Payload() payload: unknown, @Ctx() context: unknown) {
    return this.inbox.consume(ORDER_COMPLETED, payload, context as RmqContext);
  }

  @EventPattern(ORDER_CANCELLED)
  cancelled(@Payload() payload: unknown, @Ctx() context: unknown) {
    return this.inbox.consume(ORDER_CANCELLED, payload, context as RmqContext);
  }
}
