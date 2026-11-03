import { Module } from '@nestjs/common';
import { TrackingEventsConsumer } from './tracking-events.consumer.js';
import { TrackingEventsService } from './tracking-events.service.js';
import { TrackingReconciliationScheduler } from './tracking-reconciliation.scheduler.js';

@Module({
  controllers: [TrackingEventsConsumer],
  providers: [TrackingEventsService, TrackingReconciliationScheduler],
  exports: [TrackingEventsService, TrackingReconciliationScheduler],
})
export class TrackingEventsModule {}
