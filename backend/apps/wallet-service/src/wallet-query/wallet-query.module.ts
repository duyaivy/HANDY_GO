import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletQueryController } from './wallet-query.controller.js';
import { WalletQueryService, WALLET_QUERY_REPOSITORY } from './wallet-query.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [WalletQueryController],
  providers: [
    WalletQueryService,
    {
      provide: WALLET_QUERY_REPOSITORY,
      useFactory: () => {
        throw new Error('Wallet persistence is unavailable until the wallet Prisma provider is added.');
      },
    },
  ],
  exports: [WalletQueryService],
})
export class WalletQueryModule {}
