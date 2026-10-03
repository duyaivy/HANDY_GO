import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RabbitMQModule } from '@app/rabbitmq';
import { AuthDatabaseModule } from '@app/database';
import { AuthModule, AuthSignerModule } from '@app/auth';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { RateLimiterService } from './rate-limit/rate-limiter.service.js';
import { SessionService } from './session/session.service.js';
import { UserTrustClient } from './rpc/user-trust.client.js';
import { AuthSeedService } from './seed/auth-seed.service.js';
import { AuthOutboxRepository } from './outbox/auth-outbox.repository.js';

@Global()
@Module({
  imports: [
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
  providers: [
    SessionService,
    UserTrustClient,
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
    RabbitMQModule,
    AuthDatabaseModule,
    AuthModule,
    AuthSignerModule,
    SessionService,
    UserTrustClient,
    AuthSeedService,
    AuthOutboxRepository,
    OutboxRepository,
    OutboxPublisherService,
    RateLimiterService,
  ],
})
export class AuthCommonModule {}
