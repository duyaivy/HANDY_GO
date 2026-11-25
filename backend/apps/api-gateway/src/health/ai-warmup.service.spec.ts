import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AiWarmupService } from './ai-warmup.service.js';
import type { ConfigService } from '@app/config';

describe('AiWarmupService', () => {
  let service: AiWarmupService;
  let mockConfigService: Partial<ConfigService>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'https://test-ai.azure.io';
        if (key === 'AI_WARMUP_ENABLED') return 'true';
        if (key === 'AI_WARMUP_INTERVAL_MS') return '255000';
        return undefined;
      }),
    };

    service = new AiWarmupService(mockConfigService as ConfigService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should be defined with initial state', () => {
    expect(service).toBeDefined();
    const status = service.getStatus();
    expect(status.status).toBe('STARTING');
    expect(status.intervalSeconds).toBe(255);
  });

  it('should initialize with 255s interval when enabled', () => {
    service.onModuleInit();
    const status = service.getStatus();
    expect(status.serviceUrl).toBe('https://test-ai.azure.io');
    expect(status.isWarmupEnabled).toBe(true);
    expect(status.intervalSeconds).toBe(255);
  });

  it('should set status to DISABLED when AI_WARMUP_ENABLED is false', () => {
    mockConfigService.get = vi.fn((key: string) => {
      if (key === 'AI_WARMUP_ENABLED') return 'false';
      return undefined;
    });

    const disabledService = new AiWarmupService(
      mockConfigService as ConfigService,
    );
    disabledService.onModuleInit();

    const status = disabledService.getStatus();
    expect(status.status).toBe('DISABLED');
    expect(status.isWarmupEnabled).toBe(false);
  });

  it('should probe AI service and update status to UP on successful HTTP 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'AI Service đang hoạt động',
        data: { version: '1.0' },
      }),
    });

    service.onModuleInit();
    const state = await service.probeNow();

    expect(state.status).toBe('UP');
    expect(state.httpStatus).toBe(200);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.message).toBe('AI Service đang hoạt động');
    expect(state.latencyMs).toBeGreaterThanOrEqual(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-ai.azure.io/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should update status to DOWN on HTTP error or network timeout', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection timeout'));

    service.onModuleInit();
    const state = await service.probeNow();

    expect(state.status).toBe('DOWN');
    expect(state.consecutiveFailures).toBe(1);
    expect(state.error).toBe('Connection timeout');
  });

  it('should trigger recovery log and send Telegram alert if configured on DOWN -> UP recovery', async () => {
    mockConfigService.get = vi.fn((key: string) => {
      if (key === 'AI_SERVICE_URL') return 'https://test-ai.azure.io';
      if (key === 'AI_WARMUP_ENABLED') return 'true';
      if (key === 'TELEGRAM_BOT_TOKEN') return 'fake-token';
      if (key === 'TELEGRAM_CHAT_ID') return '123456';
      return undefined;
    });

    const tgService = new AiWarmupService(mockConfigService as ConfigService);
    tgService.onModuleInit();

    // First: fail (DOWN)
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Server Down'));
    await tgService.probeNow();
    expect(tgService.getStatus().status).toBe('DOWN');

    // Second: recover (UP)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Restored' }),
    });

    await tgService.probeNow();
    expect(tgService.getStatus().status).toBe('UP');
    expect(tgService.getStatus().consecutiveFailures).toBe(0);
  });
});
