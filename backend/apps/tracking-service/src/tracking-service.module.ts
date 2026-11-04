import { Module } from '@nestjs/common';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RedisModule } from '@app/redis';
import { TrackingCommonModule } from './common/index.js';
import { HealthModule } from './health/health.module.js';
import { TrackingEventsModule } from './events/index.js';
import { TimelineModule } from './timeline/index.js';
import { SummaryModule } from './summary/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'tracking-service',
      defaultPort: 3010,
    }),
    LoggerModule.forRoot('tracking-service'),
    RedisModule,
    TrackingCommonModule,
    HealthModule,
    TrackingEventsModule,
    TimelineModule,
    SummaryModule,
  ],
})
export class TrackingServiceModule {}
