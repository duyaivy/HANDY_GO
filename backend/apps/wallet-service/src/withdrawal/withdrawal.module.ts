import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WithdrawalController } from './withdrawal.controller.js';
import { WithdrawalService } from './withdrawal.service.js';
import { HttpBankAccountVerifier } from './bank-account-verifier/http-bank-account-verifier.js';
import { BankAccountVerifier } from './bank-account-verifier/bank-account-verifier.port.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [WithdrawalController], providers: [WithdrawalService, HttpBankAccountVerifier, { provide: BankAccountVerifier, useExisting: HttpBankAccountVerifier }], exports: [WithdrawalService] })
export class WithdrawalModule {}
