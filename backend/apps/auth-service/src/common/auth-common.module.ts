import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientsModule, Transport } from '@nestjs/microservices';
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
    // RPC client riêng để giao tiếp với user-trust-service
    // Tách biệt với global RABBITMQ_CLIENT (chỉ dùng để emit events)
    ClientsModule.register([
      {
        name: 'USER_TRUST_RPC_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL ?? 'amqp://handygo:handygo@localhost:5672',
          ],
          queue: 'user-trust-service',
          queueOptions: { durable: true },
        },
      },
    ]),
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
