import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { BiddingCommonModule } from './common/bidding-common.module.js';
import { RoundsModule } from './rounds/rounds.module.js';
import { BidsModule } from './bids/bids.module.js';
import { BiddingEventsModule } from './events/bidding-events.module.js';
import { SseModule } from './sse/sse.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'bidding-service', defaultPort: 3005 }),
    LoggerModule.forRoot('bidding-service'),
    HealthModule,
    RabbitMQModule,
    PrismaModule,
    BiddingCommonModule,
    RoundsModule,
    BidsModule,
    BiddingEventsModule,
    SseModule,
  ],
  controllers: [],
  providers: [],
})
export class BiddingServiceModule {}
