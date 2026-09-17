import { Module } from '@nestjs/common';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'user-trust-service',
      defaultPort: 3002,
    }),
    LoggerModule.forRoot('user-trust-service'),
    HealthModule,
  ],
  controllers: [UserTrustServiceController],
  providers: [UserTrustServiceService],
})
export class UserTrustServiceModule {}
