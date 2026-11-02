import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { DeadLetterController } from './dead-letter.controller.js';
import { AmqpDeadLetterPublisher, DeadLetterPublisher, DeadLetterService } from './dead-letter.service.js';

@Module({
  imports: [ConfigModule, WalletLedgerModule],
  controllers: [DeadLetterController],
  providers: [DeadLetterService, AmqpDeadLetterPublisher, { provide: DeadLetterPublisher, useExisting: AmqpDeadLetterPublisher }],
})
export class DeadLetterModule {}
