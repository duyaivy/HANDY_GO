import { Module } from '@nestjs/common';
import { BiddingEventsConsumer } from './bidding-events.consumer.js';
import { RoundsModule } from '../rounds/rounds.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SseModule } from '../sse/sse.module.js';

@Module({
  imports: [PrismaModule, RoundsModule, SseModule],
  controllers: [BiddingEventsConsumer],
  providers: [],
})
export class BiddingEventsModule {}
