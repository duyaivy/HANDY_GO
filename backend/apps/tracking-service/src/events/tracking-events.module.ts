import { Module } from '@nestjs/common';
import { TrackingEventsConsumer } from './tracking-events.consumer.js';
import { TrackingEventsService } from './tracking-events.service.js';

@Module({
  controllers: [TrackingEventsConsumer],
  providers: [TrackingEventsService],
  exports: [TrackingEventsService],
})
export class TrackingEventsModule {}
