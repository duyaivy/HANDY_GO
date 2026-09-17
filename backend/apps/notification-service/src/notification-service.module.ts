import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller.js';
import { NotificationServiceService } from './notification-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'notification-service',
      defaultPort: 3008,
    }),
    LoggerModule.forRoot('notification-service'),
    HealthModule,
  ],
  controllers: [NotificationServiceController],
  providers: [NotificationServiceService],
})
export class NotificationServiceModule {}
