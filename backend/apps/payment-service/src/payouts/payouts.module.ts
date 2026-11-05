import { Module } from '@nestjs/common';
import { PaymentClientsModule } from '../common/clients/payment-clients.module.js';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { MockPayoutProvider, UnavailableBankSnapshotProvider } from './mock-payout.provider.js';
import { PayoutEventsConsumer } from './payout-events.consumer.js';
import { BankSnapshotProvider, PayoutProvider } from './payout-provider.js';
import { PayoutsService } from './payouts.service.js';

@Module({
  imports: [PaymentPrismaModule, PaymentClientsModule],
  controllers: [PayoutEventsConsumer],
  providers: [
    PayoutsService,
    { provide: PayoutProvider, useClass: MockPayoutProvider },
    { provide: BankSnapshotProvider, useClass: UnavailableBankSnapshotProvider },
  ],
  exports: [PayoutsService],
})
export class PayoutsModule {}
