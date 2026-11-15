import { Module } from '@nestjs/common';
import { CommissionRulesModule } from '../commission-rules/commission-rules.module.js';
import { OrderEventsConsumer } from './order-events.consumer.js';
import { OrderEventsService } from './order-events.service.js';

@Module({
  imports: [CommissionRulesModule],
  controllers: [OrderEventsConsumer],
  providers: [OrderEventsService],
})
export class OrderEventsModule {}
