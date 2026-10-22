import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WithdrawalController } from './withdrawal.controller.js';
import { WithdrawalService } from './withdrawal.service.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [WithdrawalController], providers: [WithdrawalService], exports: [WithdrawalService] })
export class WithdrawalModule {}
