import { Module } from '@nestjs/common';
import { WalletServiceController } from './wallet-service.controller.js';
import { WalletServiceService } from './wallet-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { WalletQueryModule } from './wallet-query/wallet-query.module.js';
import { WalletLedgerModule } from './wallet-ledger/wallet-ledger.module.js';
import { PaymentDebitModule } from './payment-debit/payment-debit.module.js';
import { RefundAdjustmentModule } from './refund-adjustment/refund-adjustment.module.js';
import { WalletProvisioningModule } from './wallet-provisioning/wallet-provisioning.module.js';
import { TopupSettlementModule } from './topup-settlement/topup-settlement.module.js';
import { WithdrawalModule } from './withdrawal/withdrawal.module.js';
import { WorkerCommissionModule } from './worker-commission/worker-commission.module.js';
import { WalletEventsModule } from './wallet-events/wallet-events.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'wallet-service', defaultPort: 3009 }),
    LoggerModule.forRoot('wallet-service'),
    HealthModule,
    RabbitMQModule,
    WalletLedgerModule,
    PaymentDebitModule,
    RefundAdjustmentModule,
    WalletProvisioningModule,
    TopupSettlementModule,
    WithdrawalModule,
    WorkerCommissionModule,
    WalletEventsModule,
    WalletQueryModule,
  ],
  controllers: [WalletServiceController],
  providers: [WalletServiceService],
})
export class WalletServiceModule {}
