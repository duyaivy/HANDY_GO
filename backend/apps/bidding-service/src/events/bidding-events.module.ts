import { Module } from '@nestjs/common';
import { BiddingEventsConsumer } from './bidding-events.consumer.js';
import { RoundsModule } from '../rounds/rounds.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, RoundsModule],
  controllers: [BiddingEventsConsumer],
  providers: [],
})
export class BiddingEventsModule {}
