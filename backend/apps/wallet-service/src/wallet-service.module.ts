import { Module } from '@nestjs/common';
import { WalletServiceController } from './wallet-service.controller.js';
import { WalletServiceService } from './wallet-service.service.js';

@Module({
  imports: [],
  controllers: [WalletServiceController],
  providers: [WalletServiceService],
})
export class WalletServiceModule {}
