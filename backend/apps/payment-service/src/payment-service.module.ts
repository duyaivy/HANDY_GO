import { Module } from '@nestjs/common';
import { PaymentServiceController } from './payment-service.controller.js';
import { PaymentServiceService } from './payment-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'payment-service', defaultPort: 3007 }),
    LoggerModule.forRoot('payment-service'),
    HealthModule,
  ],
  controllers: [PaymentServiceController],
  providers: [PaymentServiceService],
})
export class PaymentServiceModule {}
