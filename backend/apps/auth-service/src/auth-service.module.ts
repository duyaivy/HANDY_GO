import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthServiceController } from './auth-service.controller.js';
import { AuthServiceService } from './auth-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { AuthDatabaseModule } from '@app/database';
import { AuthModule, AuthSignerModule } from '@app/auth';
import { OtpService, OtpFlowService } from './otp/index.js';
import { AuthSeedService } from './seed/auth-seed.service.js';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { AuthOutboxRepository } from './outbox/auth-outbox.repository.js';
import { RateLimiterService } from './rate-limit/rate-limiter.service.js';
import { UserTrustClient } from './rpc/user-trust.client.js';
import { SessionService } from './session/session.service.js';
import { RegisterFlowService } from './register/index.js';
import { LoginFlowService } from './login/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'auth-service',
      defaultPort: 3001,
      requiredKeys: ['OTP_SECRET'],
    }),
    LoggerModule.forRoot('auth-service'),
    HealthModule,
    RabbitMQModule,
    AuthDatabaseModule,
    AuthModule,
    AuthSignerModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 30,
      },
    ]),
  ],
  controllers: [AuthServiceController],
  providers: [
    AuthServiceService,
    RegisterFlowService,
    OtpFlowService,
    LoginFlowService,
    SessionService,
    UserTrustClient,
    OtpService,
    AuthSeedService,
    AuthOutboxRepository,
    {
      provide: OutboxRepository,
      useClass: AuthOutboxRepository,
    },
    OutboxPublisherService,
    RateLimiterService,
  ],
  exports: [
    AuthServiceService,
    SessionService,
    RegisterFlowService,
    OtpFlowService,
    LoginFlowService,
    UserTrustClient,
    OutboxPublisherService,
    OutboxRepository,
  ],
})
export class AuthServiceModule {}
