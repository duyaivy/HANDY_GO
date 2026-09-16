import { Module } from '@nestjs/common';
import { PaymentServiceController } from './payment-service.controller.js';
import { PaymentServiceService } from './payment-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';

@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [PaymentServiceController, HealthController],
  providers: [PaymentServiceService],
})
export class PaymentServiceModule {}
