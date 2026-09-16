import { Module } from '@nestjs/common';
import { TrackingServiceController } from './tracking-service.controller.js';
import { TrackingServiceService } from './tracking-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';


@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [TrackingServiceController, HealthController],
  providers: [TrackingServiceService],
})
export class TrackingServiceModule {}
