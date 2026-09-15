import { Module } from '@nestjs/common';
import { BiddingServiceController } from './bidding-service.controller.js';
import { BiddingServiceService } from './bidding-service.service.js';

@Module({
  imports: [],
  controllers: [BiddingServiceController],
  providers: [BiddingServiceService],
})
export class BiddingServiceModule {}
