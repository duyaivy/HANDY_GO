import { Module } from '@nestjs/common';
import { ConsumerRetryService } from './consumer-retry.service.js';

@Module({ providers: [ConsumerRetryService], exports: [ConsumerRetryService] })
export class WalletMessagingModule {}
