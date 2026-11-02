import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { PaymentDebitController } from './payment-debit.controller.js';
import { PaymentDebitService } from './payment-debit.service.js';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [PaymentDebitController], providers: [PaymentDebitService], exports: [PaymentDebitService] })
export class PaymentDebitModule {}
