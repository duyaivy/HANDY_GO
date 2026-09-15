import { Module } from '@nestjs/common';
import { MatchingServiceController } from './matching-service.controller.js';
import { MatchingServiceService } from './matching-service.service.js';

@Module({
  imports: [],
  controllers: [MatchingServiceController],
  providers: [MatchingServiceService],
})
export class MatchingServiceModule {}
