import { Module } from '@nestjs/common';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WalletMessagingModule } from '../common/messaging/wallet-messaging.module.js';
import { TopupSettlementConsumer } from './topup-settlement.consumer.js';
import { TopupSettlementController } from './topup-settlement.controller.js';
import { TopupSettlementService } from './topup-settlement.service.js';
@Module({ imports: [WalletLedgerModule, WalletMessagingModule], controllers: [TopupSettlementConsumer, TopupSettlementController], providers: [TopupSettlementService], exports: [TopupSettlementService] })
export class TopupSettlementModule {}
