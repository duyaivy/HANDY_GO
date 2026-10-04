import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { ProxyMiddleware, UPSTREAM_SERVICE_URLS } from './proxy/index.js';
import { RateLimitMiddleware } from './rate-limit/index.js';
import { GatewayExceptionFilter } from './filters/index.js';
import { FallbackController } from './fallback/index.js';
import { GatewayAuthMiddleware } from './auth/gateway-auth.middleware.js';
import { SwaggerSpecsController } from './swagger/swagger-specs.controller.js';
import { TokenVerifierService } from '@app/auth';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'api-gateway',
      defaultPort: 3000,
      requiredUrls: [...UPSTREAM_SERVICE_URLS],
    }),
    LoggerModule.forRoot('api-gateway'),
    JwtModule.register({}),
    HealthModule,
  ],
  controllers: [
    ApiGatewayController,
    SwaggerSpecsController,
    FallbackController,
  ],
  providers: [
    ApiGatewayService,
    ProxyMiddleware,
    RateLimitMiddleware,
    TokenVerifierService,
    GatewayAuthMiddleware,
    {
      provide: APP_FILTER,
      useClass: GatewayExceptionFilter,
    },
  ],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    consumer
      .apply(GatewayAuthMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    consumer
      .apply(ProxyMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
