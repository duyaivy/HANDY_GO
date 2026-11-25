import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AiWarmupService, type AiHealthState } from './ai-warmup.service.js';
import { AdminRoleGuard } from '../auth/admin-role.guard.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockAiWarmupService: Partial<AiWarmupService>;
  const adminGuard = new AdminRoleGuard();

  function mockContext(headers: Record<string, string> = {}, user?: any): any {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers, user }),
      }),
    };
  }

  const dummyState: AiHealthState = {
    status: 'UP',
    serviceUrl: 'http://localhost:8000',
    isWarmupEnabled: false,
    intervalSeconds: 255,
    lastCheckedAt: '2026-11-25T00:00:00.000Z',
    latencyMs: 45,
    httpStatus: 200,
    consecutiveFailures: 0,
    message: 'AI Service liveness check OK (HTTP 200).',
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
        AdminRoleGuard,
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return gateway health publicly without auth', () => {
    const res = controller.check();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('api-gateway');
  });

  it('should return AI health status from service for Admin', () => {
    const res = controller.getAiHealth();
    expect(res.status).toBe('UP');
    expect(res.latencyMs).toBe(45);
    expect(mockAiWarmupService.getStatus).toHaveBeenCalled();
  });

  it('should trigger immediate probe on probeAiHealth for Admin', async () => {
    const res = await controller.probeAiHealth();
    expect(res.status).toBe('UP');
    expect(mockAiWarmupService.probeNow).toHaveBeenCalled();
  });

  describe('Admin authorization checks (AdminRoleGuard)', () => {
    it('rejects anonymous callers with 401 Unauthorized', () => {
      const ctx = mockContext({});
      expect(() => adminGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('rejects Customer role with 403 Forbidden', () => {
      const ctx = mockContext({
        'x-user-id': 'cust-1',
        'x-user-roles': 'Customer',
      });
      expect(() => adminGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('rejects Worker role with 403 Forbidden', () => {
      const ctx = mockContext({
        'x-user-id': 'worker-1',
        'x-user-roles': 'Worker',
      });
      expect(() => adminGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows Admin role with 200 OK', () => {
      const ctx = mockContext({
        'x-user-id': 'admin-1',
        'x-user-roles': 'Admin',
      });
      expect(adminGuard.canActivate(ctx)).toBe(true);
    });
  });
});
