import { Module } from '@nestjs/common';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';

@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [ApiGatewayController, HealthController],
  providers: [ApiGatewayService],
})
export class ApiGatewayModule {}