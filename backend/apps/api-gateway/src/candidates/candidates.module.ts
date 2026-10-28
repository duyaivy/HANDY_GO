import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesAggregationService } from './candidates-aggregation.service.js';
import { OrderClient } from './clients/order.client.js';
import { BiddingClient } from './clients/bidding.client.js';
import { MatchingClient } from './clients/matching.client.js';

@Module({
  controllers: [CandidatesController],
  providers: [
    CandidatesAggregationService,
    OrderClient,
    BiddingClient,
    MatchingClient,
  ],
  exports: [CandidatesAggregationService],
})
export class CandidatesModule {}
