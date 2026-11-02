import { Module, Global } from '@nestjs/common';
import { RedisModule } from '@app/redis';
import { PrismaService } from './prisma/prisma.service.js';
import { TrustedGatewayGuard } from './security/trusted-gateway.guard.js';
import { TimelineStreamService } from './stream/timeline-stream.service.js';

@Global()
@Module({
  imports: [RedisModule],
  providers: [PrismaService, TrustedGatewayGuard, TimelineStreamService],
  exports: [PrismaService, TrustedGatewayGuard, TimelineStreamService],
})
export class TrackingCommonModule {}

