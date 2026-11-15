import { Module } from '@nestjs/common';
import { OrderEligibilityClient } from './order-eligibility.client.js';
import { WalletClient } from './wallet.client.js';

@Module({
  providers: [OrderEligibilityClient, WalletClient],
  exports: [OrderEligibilityClient, WalletClient],
})
export class PaymentClientsModule {}
