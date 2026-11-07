import { Module } from '@nestjs/common';
import { PaymentServiceController } from './payment-service.controller.js';
import { PaymentServiceService } from './payment-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { PaymentQueryModule } from './payment-query/payment-query.module.js';
import { PaymentDatabaseModule } from './common/database/payment-database.module.js';
import { PaymentInboundModule } from './common/inbound/payment-inbound.module.js';
import { OrderEventsModule } from './order-events/order-events.module.js';
import { PaymentOrdersModule } from './payment-orders/payment-orders.module.js';
import { PayoutsModule } from './payouts/payouts.module.js';
import { ReconciliationModule } from './reconciliation/reconciliation.module.js';
import { TopupsModule } from './topups/topups.module.js';
import { RefundsModule } from './refunds/refunds.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'payment-service', defaultPort: 3007 }),
    LoggerModule.forRoot('payment-service'),
    HealthModule,
    RabbitMQModule,
    PaymentDatabaseModule,
    PaymentInboundModule,
    OrderEventsModule,
    // Static `/payments/topups*` routes must be registered before `/payments/:id`.
    TopupsModule,
    RefundsModule,
    PaymentOrdersModule,
    PaymentQueryModule,
    PayoutsModule,
    ReconciliationModule,
  ],
  controllers: [PaymentServiceController],
  providers: [PaymentServiceService],
})
export class PaymentServiceModule {}
