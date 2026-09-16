import { Module } from '@nestjs/common';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';

@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [UserTrustServiceController, HealthController],
  providers: [UserTrustServiceService],
})
export class UserTrustServiceModule {}
