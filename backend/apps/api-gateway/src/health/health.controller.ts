import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AiWarmupService, type AiHealthState } from './ai-warmup.service.js';
import { AdminRoleGuard } from '../auth/admin-role.guard.js';

@Controller('health')
export class HealthController {
  constructor(private readonly aiWarmupService: AiWarmupService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ai')
  @UseGuards(AdminRoleGuard)
  getAiHealth(): AiHealthState {
    return this.aiWarmupService.getStatus();
  }

  @Post('ai/probe')
  @UseGuards(AdminRoleGuard)
  async probeAiHealth(): Promise<AiHealthState> {
    return await this.aiWarmupService.probeNow();
  }
}
