import { Module } from '@nestjs/common';
import { RefundsModule } from '../refunds/refunds.module.js';
import { PaymentOrdersModule } from '../payment-orders/payment-orders.module.js';
import { PayoutsModule } from '../payouts/payouts.module.js';
import { TopupsModule } from '../topups/topups.module.js';
import { PaymentReconcilerService } from './payment-reconciler.service.js';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentOperationsController } from './payment-operations.controller.js';
import { PaymentOperationsService } from './payment-operations.service.js';

@Module({
  imports: [
    JwtModule.register({}),
    PaymentOrdersModule,
    TopupsModule,
    PayoutsModule,
    RefundsModule,
  ],
  controllers: [PaymentOperationsController],
  providers: [
    PaymentReconcilerService,
    PaymentOperationsService,
    JwtAuthGuard,
    TokenVerifierService,
  ],
})
export class ReconciliationModule {}
