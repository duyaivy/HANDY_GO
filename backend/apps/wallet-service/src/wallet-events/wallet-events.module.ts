import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { WalletOutboxRepository } from './wallet-outbox.repository.js';
import { WalletEventsController } from './wallet-events.controller.js';
import { WalletEventsService } from './wallet-events.service.js';
@Module({ imports: [ConfigModule, WalletLedgerModule], controllers: [WalletEventsController], providers: [WalletEventsService, OutboxPublisherService, { provide: OutboxRepository, useClass: WalletOutboxRepository }], exports: [WalletEventsService] })
export class WalletEventsModule {}
