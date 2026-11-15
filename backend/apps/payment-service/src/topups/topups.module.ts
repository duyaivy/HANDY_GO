import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { TopupIpnController, TopupsController, WalletTopupEventsConsumer } from './topups.controller.js';
import { TopupsService } from './topups.service.js';
import { TopupProvider } from './providers/topup-provider.js';
import { VnpayTopupProvider } from './providers/vnpay-topup.provider.js';
import { MockTopupProvider } from './providers/mock-topup.provider.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule],
  // The IPN controller is listed first so `/payments/topups/vnpay/ipn` is never shadowed by `/:id`.
  controllers: [TopupIpnController, TopupsController, WalletTopupEventsConsumer],
  providers: [TopupsService, { provide: TopupProvider, useFactory: () =>
    process.env.NODE_ENV !== 'production' && process.env.TOPUP_MOCK_ENABLED?.trim().toLowerCase() === 'true'
      ? new MockTopupProvider() : new VnpayTopupProvider() }, JwtAuthGuard, TokenVerifierService],
  exports: [TopupsService],
})
export class TopupsModule {}
