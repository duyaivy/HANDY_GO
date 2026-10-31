import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SseController } from './sse.controller.js';
import { SseService } from './sse.service.js';
import { SseEventBridgeService } from './sse-event-bridge.service.js';
import { RequestEligibilityVerifierService } from '../bids/services/request-eligibility-verifier.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SseController],
  providers: [
    SseService,
    SseEventBridgeService,
    RequestEligibilityVerifierService,
  ],
  exports: [SseService, SseEventBridgeService],
})
export class SseModule {}
