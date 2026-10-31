import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WorkerCommissionController } from './worker-commission.controller.js';
import { WorkerCommissionService } from './worker-commission.service.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [WorkerCommissionController], providers: [WorkerCommissionService], exports: [WorkerCommissionService] })
export class WorkerCommissionModule {}
