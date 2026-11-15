import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentClientsModule } from '../common/clients/payment-clients.module.js';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { PaymentQueryModule } from '../payment-query/payment-query.module.js';
import { PaymentOrdersController } from './payment-orders.controller.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule, PaymentClientsModule, PaymentQueryModule],
  controllers: [PaymentOrdersController],
  providers: [PaymentOrdersService, JwtAuthGuard, TokenVerifierService],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
