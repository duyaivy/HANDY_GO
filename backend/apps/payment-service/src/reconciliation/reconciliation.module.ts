import { Module } from '@nestjs/common';
import { PaymentOrdersModule } from '../payment-orders/payment-orders.module.js';
import { PayoutsModule } from '../payouts/payouts.module.js';
import { TopupsModule } from '../topups/topups.module.js';
import { PaymentReconcilerService } from './payment-reconciler.service.js';

@Module({
  imports: [PaymentOrdersModule, TopupsModule, PayoutsModule],
  providers: [PaymentReconcilerService],
})
export class ReconciliationModule {}
