import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { RefundAdjustmentController } from './refund-adjustment.controller.js';
import { RefundAdjustmentService } from './refund-adjustment.service.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [RefundAdjustmentController], providers: [RefundAdjustmentService], exports: [RefundAdjustmentService] })
export class RefundAdjustmentModule {}
