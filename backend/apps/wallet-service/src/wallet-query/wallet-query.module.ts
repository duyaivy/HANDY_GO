import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletQueryController } from './wallet-query.controller.js';
import { WalletQueryService, WALLET_QUERY_REPOSITORY } from './wallet-query.service.js';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WalletPrismaQueryRepository } from './wallet-prisma-query.repository.js';

@Module({
  imports: [ConfigModule, WalletLedgerModule],
  controllers: [WalletQueryController],
  providers: [
    WalletQueryService,
    {
      provide: WALLET_QUERY_REPOSITORY,
      useClass: WalletPrismaQueryRepository,
    },
  ],
  exports: [WalletQueryService],
})
export class WalletQueryModule {}
