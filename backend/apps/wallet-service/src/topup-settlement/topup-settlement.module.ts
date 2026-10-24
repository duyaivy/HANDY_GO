import { Module } from '@nestjs/common';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { TopupSettlementConsumer } from './topup-settlement.consumer.js';
import { TopupSettlementController } from './topup-settlement.controller.js';
import { TopupSettlementService } from './topup-settlement.service.js';
@Module({ imports: [WalletLedgerModule], controllers: [TopupSettlementConsumer, TopupSettlementController], providers: [TopupSettlementService], exports: [TopupSettlementService] })
export class TopupSettlementModule {}
