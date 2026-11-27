import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AiWarmupService } from './ai-warmup.service.js';
import { AdminRoleGuard } from '../auth/admin-role.guard.js';

@Module({
  controllers: [HealthController],
  providers: [AiWarmupService, AdminRoleGuard],
  exports: [AiWarmupService],
})
export class HealthModule {}
