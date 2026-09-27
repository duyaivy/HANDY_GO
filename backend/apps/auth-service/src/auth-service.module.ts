import { Module } from '@nestjs/common';
import { AuthServiceController } from './auth-service.controller.js';
import { AuthServiceService } from './auth-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { AuthDatabaseModule } from '@app/database';
import { AuthModule, AuthSignerModule } from '@app/auth';
import { OtpService } from './otp/otp.service.js';
import { AuthSeedService } from './seed/auth-seed.service.js';
import { OutboxPublisherService } from './outbox/outbox-publisher.service.js';
import { RateLimiterService } from './rate-limit/rate-limiter.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'auth-service', defaultPort: 3001 }),
    LoggerModule.forRoot('auth-service'),
    HealthModule,
    RabbitMQModule,
    AuthDatabaseModule,
    AuthModule,
    AuthSignerModule,
  ],
  controllers: [AuthServiceController],
  providers: [
    AuthServiceService,
    OtpService,
    AuthSeedService,
    OutboxPublisherService,
    RateLimiterService,
  ],
  exports: [AuthServiceService],
})
export class AuthServiceModule {}
