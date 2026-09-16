import { Module } from '@nestjs/common';
import { WalletServiceController } from './wallet-service.controller.js';
import { WalletServiceService } from './wallet-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';


@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [WalletServiceController, HealthController],
  providers: [WalletServiceService],
})
export class WalletServiceModule {}
