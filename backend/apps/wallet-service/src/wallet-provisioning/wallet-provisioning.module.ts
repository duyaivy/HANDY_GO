import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WalletProvisioningController } from './wallet-provisioning.controller.js';
import { WalletProvisioningConsumer } from './wallet-provisioning.consumer.js';
import { WalletProvisioningService } from './wallet-provisioning.service.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [WalletProvisioningController, WalletProvisioningConsumer], providers: [WalletProvisioningService], exports: [WalletProvisioningService] })
export class WalletProvisioningModule {}
