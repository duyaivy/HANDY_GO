import { Module } from '@nestjs/common';
import { WalletServiceController } from './wallet-service.controller.js';
import { WalletServiceService } from './wallet-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'wallet-service', defaultPort: 3009 }),
    LoggerModule.forRoot('wallet-service'),
    HealthModule,
  ],
  controllers: [WalletServiceController],
  providers: [WalletServiceService],
})
export class WalletServiceModule {}
