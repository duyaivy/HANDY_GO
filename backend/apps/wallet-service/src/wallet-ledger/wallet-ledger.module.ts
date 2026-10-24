import { Global, Module } from '@nestjs/common';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { WalletPrismaService } from './wallet-prisma.service.js';
import { ConfigModule } from '@app/config';
import { WalletLedgerController } from './wallet-ledger.controller.js';

@Global()
@Module({ imports: [ConfigModule], controllers: [WalletLedgerController], providers: [WalletPrismaService, WalletLedgerService], exports: [WalletPrismaService, WalletLedgerService] })
export class WalletLedgerModule {}
