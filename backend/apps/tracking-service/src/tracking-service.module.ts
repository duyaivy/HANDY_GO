import { Module } from '@nestjs/common';
import { TrackingServiceController } from './tracking-service.controller.js';
import { TrackingServiceService } from './tracking-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'tracking-service',
      defaultPort: 3010,
    }),
    LoggerModule.forRoot('tracking-service'),
    HealthModule,
  ],
  controllers: [TrackingServiceController],
  providers: [TrackingServiceService],
})
export class TrackingServiceModule {}
