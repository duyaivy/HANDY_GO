import { Module } from '@nestjs/common';
import { MatchingServiceController } from './matching-service.controller.js';
import { MatchingServiceService } from './matching-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'matching-service',
      defaultPort: 3006,
    }),
    LoggerModule.forRoot('matching-service'),
    HealthModule,
  ],
  controllers: [MatchingServiceController],
  providers: [MatchingServiceService],
})
export class MatchingServiceModule {}
