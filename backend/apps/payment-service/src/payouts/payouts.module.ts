import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PayoutAdminController } from './payout-admin.controller.js';
import { PaymentClientsModule } from '../common/clients/payment-clients.module.js';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { MockPayoutProvider } from './mock-payout.provider.js';
import { SandboxBankSnapshotProvider } from './sandbox-bank-snapshot.provider.js';
import { PayoutEventsConsumer } from './payout-events.consumer.js';
import { BankSnapshotProvider, PayoutProvider } from './payout-provider.js';
import { PayoutsService } from './payouts.service.js';

@Module({
  imports: [PaymentPrismaModule, PaymentClientsModule, JwtModule.register({})],
  controllers: [PayoutEventsConsumer, PayoutAdminController],
  providers: [
    PayoutsService,
    JwtAuthGuard, TokenVerifierService,
    { provide: PayoutProvider, useClass: MockPayoutProvider },
    { provide: BankSnapshotProvider, useClass: SandboxBankSnapshotProvider },
  ],
  exports: [PayoutsService],
})
export class PayoutsModule {}
