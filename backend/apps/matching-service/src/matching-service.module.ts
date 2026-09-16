import { Module } from '@nestjs/common';
import { MatchingServiceController } from './matching-service.controller.js';
import { MatchingServiceService } from './matching-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';


@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [MatchingServiceController, HealthController],
  providers: [MatchingServiceService],
})
export class MatchingServiceModule {}
