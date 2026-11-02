import { Module } from '@nestjs/common';
import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrderCommonModule } from './common/order-common.module.js';
import { ServiceRequestsModule } from './service-requests/service-requests.module.js';
import { BookingProposalsModule } from './booking-proposals/booking-proposals.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { InternalOrderModule } from './internal/internal.module.js';
import { PaymentEventsConsumer } from './consumers/payment-events.consumer.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'order-service', defaultPort: 3004 }),
    LoggerModule.forRoot('order-service'),
    HealthModule,
    RabbitMQModule,
    PrismaModule,
    OrderCommonModule,
    ServiceRequestsModule,
    BookingProposalsModule,
    OrdersModule,
    InternalOrderModule,
  ],
  controllers: [OrderServiceController, PaymentEventsConsumer],
  providers: [OrderServiceService],
})
export class OrderServiceModule {}
