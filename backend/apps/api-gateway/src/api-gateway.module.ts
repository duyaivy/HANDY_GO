import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { AuthGatewayController } from './auth/auth-gateway.controller.js';
import { UsersGatewayController } from './users/users-gateway.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'api-gateway',
      defaultPort: 3000,
      requiredUrls: ['AUTH_SERVICE_URL'],
    }),
    LoggerModule.forRoot('api-gateway'),
    HealthModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  controllers: [
    ApiGatewayController,
    AuthGatewayController,
    UsersGatewayController,
  ],
  providers: [
    ApiGatewayService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ApiGatewayModule {}
