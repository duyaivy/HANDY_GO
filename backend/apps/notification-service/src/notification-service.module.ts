import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller.js';
import { NotificationServiceService } from './notification-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';


@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [NotificationServiceController, HealthController],
  providers: [NotificationServiceService],
})
export class NotificationServiceModule {}
