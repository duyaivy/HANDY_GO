import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';
import { RoundsModule } from '../rounds/rounds.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, RoundsModule],
  controllers: [BidsController],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
