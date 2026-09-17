import { Module } from '@nestjs/common';
import { BiddingServiceController } from './bidding-service.controller.js';
import { BiddingServiceService } from './bidding-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'bidding-service', defaultPort: 3005 }),
    LoggerModule.forRoot('bidding-service'),
    HealthModule,
  ],
  controllers: [BiddingServiceController],
  providers: [BiddingServiceService],
})
export class BiddingServiceModule {}
