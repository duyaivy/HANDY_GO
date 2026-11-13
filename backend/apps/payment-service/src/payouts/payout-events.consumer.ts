import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { WALLET_WITHDRAWAL_REQUESTED } from './payouts.service.js';

@Controller()
export class PayoutEventsConsumer {
  constructor(private readonly inbox: PaymentInboxService) {}

  @EventPattern(WALLET_WITHDRAWAL_REQUESTED)
  requested(@Payload() payload: unknown, @Ctx() context: unknown) {
    return this.inbox.consume(WALLET_WITHDRAWAL_REQUESTED, payload, context as RmqContext);
  }
}
