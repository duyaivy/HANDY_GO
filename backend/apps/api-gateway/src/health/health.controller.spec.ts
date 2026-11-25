import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthController } from './health.controller.js';
import { AiWarmupService, type AiHealthState } from './ai-warmup.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockAiWarmupService: Partial<AiWarmupService>;

  const dummyState: AiHealthState = {
    status: 'UP',
    serviceUrl: 'http://localhost:8000',
    isWarmupEnabled: true,
    intervalSeconds: 255,
    lastCheckedAt: '2026-11-25T00:00:00.000Z',
    latencyMs: 45,
    httpStatus: 200,
    consecutiveFailures: 0,
    message: 'AI Service is active',
  };

  beforeEach(async () => {
    mockAiWarmupService = {
      getStatus: vi.fn().mockReturnValue(dummyState),
      probeNow: vi.fn().mockResolvedValue(dummyState),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: AiWarmupService,
          useValue: mockAiWarmupService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return gateway health', () => {
    const res = controller.check();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('api-gateway');
  });

  it('should return AI health status from service', () => {
    const res = controller.getAiHealth();
    expect(res.status).toBe('UP');
    expect(res.latencyMs).toBe(45);
    expect(mockAiWarmupService.getStatus).toHaveBeenCalled();
  });

  it('should trigger immediate probe on probeAiHealth', async () => {
    const res = await controller.probeAiHealth();
    expect(res.status).toBe('UP');
    expect(mockAiWarmupService.probeNow).toHaveBeenCalled();
  });
});
