import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';
import { WorkerProfileEnricherService } from './services/worker-profile-enricher.service.js';
import { RoundsModule } from '../rounds/rounds.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, RoundsModule],
  controllers: [BidsController],
  providers: [BidsService, WorkerProfileEnricherService],
  exports: [BidsService, WorkerProfileEnricherService],
})
export class BidsModule {}
