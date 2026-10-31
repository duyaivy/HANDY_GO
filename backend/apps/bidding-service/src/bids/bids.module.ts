import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';
import { WorkerProfileEnricherService } from './services/worker-profile-enricher.service.js';
import { RequestEligibilityVerifierService } from './services/request-eligibility-verifier.service.js';
import { RoundsModule } from '../rounds/rounds.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SseModule } from '../sse/sse.module.js';

@Module({
  imports: [PrismaModule, RoundsModule, SseModule],
  controllers: [BidsController],
  providers: [
    BidsService,
    WorkerProfileEnricherService,
    RequestEligibilityVerifierService,
  ],
  exports: [
    BidsService,
    WorkerProfileEnricherService,
    RequestEligibilityVerifierService,
  ],
})
export class BidsModule {}
