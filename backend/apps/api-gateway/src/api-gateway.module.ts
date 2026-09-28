import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { AuthGatewayController } from './auth/auth-gateway.controller.js';
import { UsersGatewayController } from './users/users-gateway.controller.js';
import { ProxyMiddleware, UPSTREAM_SERVICE_URLS } from './proxy/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'api-gateway',
      defaultPort: 3000,
      requiredUrls: [...UPSTREAM_SERVICE_URLS],
    }),
    LoggerModule.forRoot('api-gateway'),
    HealthModule,
  ],
  controllers: [
    ApiGatewayController,
    AuthGatewayController,
    UsersGatewayController,
  ],
  providers: [ApiGatewayService, ProxyMiddleware],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ProxyMiddleware).forRoutes('*');
  }
}

