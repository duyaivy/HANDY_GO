import { Module } from '@nestjs/common';
import { TrackingServiceController } from './tracking-service.controller.js';
import { TrackingServiceService } from './tracking-service.service.js';

@Module({
  imports: [],
  controllers: [TrackingServiceController],
  providers: [TrackingServiceService],
})
export class TrackingServiceModule {}
