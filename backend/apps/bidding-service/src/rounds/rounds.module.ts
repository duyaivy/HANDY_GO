import { Module } from '@nestjs/common';
import { RoundsController } from './rounds.controller.js';
import { RoundsService } from './rounds.service.js';
import { RoundExpirationSchedulerService } from './round-expiration.scheduler.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [RoundsController],
  providers: [RoundsService, RoundExpirationSchedulerService],
  exports: [RoundsService, RoundExpirationSchedulerService],
})
export class RoundsModule {}
