import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { TopupIpnController, TopupsController, WalletTopupEventsConsumer } from './topups.controller.js';
import { TopupsService } from './topups.service.js';
import { TopupProvider } from './providers/topup-provider.js';
import { VnpayTopupProvider } from './providers/vnpay-topup.provider.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule],
  // The IPN controller is listed first so `/payments/topups/vnpay/ipn` is never shadowed by `/:id`.
  controllers: [TopupIpnController, TopupsController, WalletTopupEventsConsumer],
  providers: [TopupsService, { provide: TopupProvider, useClass: VnpayTopupProvider }, JwtAuthGuard, TokenVerifierService],
  exports: [TopupsService],
})
export class TopupsModule {}
