import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@app/config';
import { LoggerModule } from '@app/logger';
import { NotificationPrismaService } from './notification-prisma.service.js';
import { TrustedGatewayGuard } from './trusted-gateway.guard.js';
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
  ],
  providers: [
    NotificationPrismaService,
    TrustedGatewayGuard,
    { provide: APP_INTERCEPTOR, useClass: PersistenceErrorsInterceptor },
  ],
  exports: [NotificationPrismaService, TrustedGatewayGuard],
})
export class NotificationCommonModule {}
