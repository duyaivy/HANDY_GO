import { Module } from '@nestjs/common';
import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';

@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [OrderServiceController, HealthController],
  providers: [OrderServiceService],
})
export class OrderServiceModule {}
