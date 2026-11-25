import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AiWarmupService } from './ai-warmup.service.js';

@Module({
  controllers: [HealthController],
  providers: [AiWarmupService],
  exports: [AiWarmupService],
})
export class HealthModule {}
