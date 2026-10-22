import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TopupSettlementService } from './topup-settlement.service.js';
import { PaymentTopupSucceededDto } from './dto/payment-topup-succeeded.dto.js';
@Controller()
export class TopupSettlementConsumer {
  constructor(private readonly service: TopupSettlementService) {}
  @EventPattern('payment.topup.succeeded') async onTopupSucceeded(@Payload() event: PaymentTopupSucceededDto) { await this.service.settle(event); }
}
