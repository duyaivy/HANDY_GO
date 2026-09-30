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
import { UserTrustClient } from './rpc/user-trust.client.js';
import { SessionService } from './session/session.service.js';
import { RegisterFlowService } from './flows/register-flow.service.js';
import { OtpFlowService } from './flows/otp-flow.service.js';
import { LoginFlowService } from './flows/login-flow.service.js';

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
  ],
})
export class AuthServiceModule {}
