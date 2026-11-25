import { Controller, Get, Post } from '@nestjs/common';
import { AiWarmupService, type AiHealthState } from './ai-warmup.service.js';

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
  getAiHealth(): AiHealthState {
    return this.aiWarmupService.getStatus();
  }

  @Post('ai/probe')
  async probeAiHealth(): Promise<AiHealthState> {
    return await this.aiWarmupService.probeNow();
  }
}
