import { Module } from '@nestjs/common';
import { AuthServiceController } from './auth-service.controller.js';
import { AuthServiceService } from './auth-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';

@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [AuthServiceController, HealthController],
  providers: [AuthServiceService],
})
export class AuthServiceModule {}
