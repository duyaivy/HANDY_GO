import { Module } from '@nestjs/common';
import { BiddingServiceController } from './bidding-service.controller.js';
import { BiddingServiceService } from './bidding-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';


@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [BiddingServiceController, HealthController],
  providers: [BiddingServiceService],
})
export class BiddingServiceModule {}
