import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { ConfigModule } from '@app/config';
import { LoggerModule } from '@app/logger';
import { NotificationPrismaService } from './notification-prisma.service.js';
import { TrustedGatewayGuard } from './trusted-gateway.guard.js';
import { AdminGuard } from './admin.guard.js';
import { UserTrustRpcClient } from './rpc/user-trust-rpc.client.js';
import { PersistenceErrorsInterceptor } from './persistence-errors.interceptor.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'notification-service',
      defaultPort: 3008,
      requiredKeys: ['INTERNAL_SERVICE_SECRET'],
    }),
    LoggerModule.forRoot('notification-service'),
    ClientsModule.registerAsync([
      {
        name: 'USER_TRUST_RPC_CLIENT',
        inject: [NestConfigService],
        useFactory: (config: NestConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              config.get<string>('RABBITMQ_URL') ??
                'amqp://handygo:handygo@localhost:5672',
            ],
            queue: 'user-trust-service',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  providers: [
    NotificationPrismaService,
    TrustedGatewayGuard,
    AdminGuard,
    UserTrustRpcClient,
    { provide: APP_INTERCEPTOR, useClass: PersistenceErrorsInterceptor },
  ],
  exports: [
    NotificationPrismaService,
    TrustedGatewayGuard,
    AdminGuard,
    UserTrustRpcClient,
  ],
})
export class NotificationCommonModule {}
