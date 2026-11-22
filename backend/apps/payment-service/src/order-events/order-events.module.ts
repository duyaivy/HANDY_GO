import { Module } from '@nestjs/common';
import { CommissionRulesModule } from '../commission-rules/commission-rules.module.js';
import { OrderEventsConsumer } from './order-events.consumer.js';
import { OrderEventsService } from './order-events.service.js';
import { DisputeRefundService } from './dispute-refund.service.js';
import { RefundsModule } from '../refunds/refunds.module.js';

@Module({
  imports: [CommissionRulesModule, RefundsModule],
  controllers: [OrderEventsConsumer],
  providers: [OrderEventsService, DisputeRefundService],
})
export class OrderEventsModule {}
