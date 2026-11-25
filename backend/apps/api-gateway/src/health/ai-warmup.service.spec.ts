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

  it('should be defined with initial state (disabled by default)', () => {
    expect(service).toBeDefined();
    const status = service.getStatus();
    expect(status.status).toBe('STARTING');
    expect(status.intervalSeconds).toBe(255);
    expect(status.isWarmupEnabled).toBe(false);
  });

  describe('Opt-in configuration (P1)', () => {
    it('defaults to DISABLED when AI_WARMUP_ENABLED is not configured', () => {
      mockConfigService.get = vi.fn(() => undefined);
      const defaultService = new AiWarmupService(mockConfigService as ConfigService);
      defaultService.onModuleInit();

      const status = defaultService.getStatus();
      expect(status.status).toBe('DISABLED');
      expect(status.isWarmupEnabled).toBe(false);
      expect(status.message).toContain('opt-in via AI_WARMUP_ENABLED=true');
    });

    it('enables warmup only when AI_WARMUP_ENABLED is explicitly true', () => {
      service.onModuleInit();
      const status = service.getStatus();
      expect(status.serviceUrl).toBe('https://test-ai.azure.io');
      expect(status.isWarmupEnabled).toBe(true);
      expect(status.intervalSeconds).toBe(255);
    });
  });

  describe('Interval validation and integer bounds (P2)', () => {
    it('uses configured interval when within bounds [10000, 3600000]', () => {
      mockConfigService.get = vi.fn((key: string) => {
        if (key === 'AI_WARMUP_INTERVAL_MS') return '120000';
        if (key === 'AI_WARMUP_ENABLED') return 'true';
        return undefined;
      });
      const customService = new AiWarmupService(mockConfigService as ConfigService);
      customService.onModuleInit();
      expect(customService.getStatus().intervalSeconds).toBe(120);
    });

    it('falls back to DEFAULT_INTERVAL_MS (255s) for invalid, out of bounds or unsafe integer intervals', () => {
      const invalidIntervals = [
        'invalid',
        'Infinity',
        '-Infinity',
        'NaN',
        '2147483648', // > 2^31-1 ms
        '1000000000000',
        '-1000',
        '0',
        '255000.5', // fractional
        '',
        '   ',
        '5000', // below MIN_INTERVAL_MS (10000)
        '5000000', // above MAX_INTERVAL_MS (3600000)
      ];

      for (const val of invalidIntervals) {
        mockConfigService.get = vi.fn((key: string) => {
          if (key === 'AI_WARMUP_INTERVAL_MS') return val;
          if (key === 'AI_WARMUP_ENABLED') return 'true';
          return undefined;
        });
        const boundService = new AiWarmupService(mockConfigService as ConfigService);
        boundService.onModuleInit();
        expect(boundService.getStatus().intervalSeconds).toBe(255);
      }
    });
  });

  describe('Single-flight and probe cooldown (P2)', () => {
    it('deduplicates concurrent probe requests to a single outbound fetch (single-flight)', async () => {
      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        // simulate async network delay
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'healthy', version: '1.0' }),
        };
      });

      service.onModuleInit();

      // Launch 3 probe calls simultaneously
      const [res1, res2, res3] = await Promise.all([
        service.probeNow(),
        service.probeNow(),
        service.probeNow(),
      ]);

      expect(fetchCallCount).toBe(1);
      expect(res1.status).toBe('UP');
      expect(res2.status).toBe('UP');
      expect(res3.status).toBe('UP');
    });

    it('returns cached state within the cooldown window without triggering a new fetch', async () => {
      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'healthy' }),
        };
      });

      service.onModuleInit();

      // First call -> triggers fetch
      const first = await service.probeNow();
      expect(first.status).toBe('UP');
      expect(fetchCallCount).toBe(1);

      // Advance time by only 1000ms (less than PROBE_COOLDOWN_MS = 3000ms)
      vi.advanceTimersByTime(1000);

      // Second call within cooldown window -> uses cached state
      const second = await service.probeNow();
      expect(second.status).toBe('UP');
      expect(fetchCallCount).toBe(1);

      // Advance time beyond cooldown window (4000ms > 3000ms)
      vi.advanceTimersByTime(4000);

      // Third call -> triggers new fetch
      const third = await service.probeNow();
      expect(third.status).toBe('UP');
      expect(fetchCallCount).toBe(2);
    });
  });

  describe('Schema and liveness semantics validation (P2)', () => {
    it('updates status to UP on valid JSON with healthy/ok status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          status: 'healthy',
          appName: 'CCCD AI Service',
        }),
      });

      service.onModuleInit();
      const state = await service.probeNow();

      expect(state.status).toBe('UP');
      expect(state.httpStatus).toBe(200);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.message).toContain('AI Service liveness check OK');
    });

    it('treats HTML response as DOWN even if HTTP 200', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><body>Welcome</body></html>',
      });

      service.onModuleInit();
      const state = await service.probeNow();

      expect(state.status).toBe('DOWN');
      expect(state.consecutiveFailures).toBe(1);
      expect(state.error).toContain('Expected application/json response');
    });

    it('treats malformed JSON response as DOWN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      });

      service.onModuleInit();
      const state = await service.probeNow();

      expect(state.status).toBe('DOWN');
      expect(state.consecutiveFailures).toBe(1);
      expect(state.error).toContain('Malformed JSON');
    });

    it('treats response with non-healthy status as DOWN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'degraded' }),
      });

      service.onModuleInit();
      const state = await service.probeNow();

      expect(state.status).toBe('DOWN');
      expect(state.consecutiveFailures).toBe(1);
      expect(state.error).toContain('AI Health returned non-healthy status');
    });
  });

  describe('Telegram alerting and HTML escaping (P3)', () => {
    it('escapes HTML special characters in alert messages and validates Telegram API response', async () => {
      mockConfigService.get = vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'https://test-ai.azure.io';
        if (key === 'AI_WARMUP_ENABLED') return 'true';
        if (key === 'TELEGRAM_BOT_TOKEN') return 'secret-token-xyz';
        if (key === 'TELEGRAM_CHAT_ID') return '123456';
        return undefined;
      });

      let sentBody: string = '';
      global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.telegram.org')) {
          sentBody = opts.body;
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
          };
        }
        // AI health check returns malicious/special chars error
        throw new Error('Database <connection> & "auth" failed');
      });

      const tgService = new AiWarmupService(mockConfigService as ConfigService);
      tgService.onModuleInit();
      await tgService.probeNow();

      expect(sentBody).toBeDefined();
      expect(sentBody).toContain('&lt;connection&gt;');
      expect(sentBody).toContain('&amp;');
      expect(sentBody).toContain('&quot;auth&quot;');
      // Must not contain raw unescaped HTML injection
      expect(sentBody).not.toContain('<connection>');
    });

    it('handles Telegram HTTP 400 and 429 errors gracefully without throwing', async () => {
      mockConfigService.get = vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'https://test-ai.azure.io';
        if (key === 'AI_WARMUP_ENABLED') return 'true';
        if (key === 'TELEGRAM_BOT_TOKEN') return 'secret-token-xyz';
        if (key === 'TELEGRAM_CHAT_ID') return '123456';
        return undefined;
      });

      global.fetch = vi.fn().mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.telegram.org')) {
          return {
            ok: false,
            status: 429,
            text: async () => 'Too Many Requests',
          };
        }
        throw new Error('Connection refused');
      });

      const tgService = new AiWarmupService(mockConfigService as ConfigService);
      tgService.onModuleInit();
      // Should complete without throwing unhandled rejection
      await expect(tgService.probeNow()).resolves.toBeDefined();
    });
  });

  describe('Lifecycle cleanup (P3)', () => {
    it('cancels initial timer on module destruction before 3s bootstrap elapses', () => {
      let probeCalled = false;
      global.fetch = vi.fn().mockImplementation(async () => {
        probeCalled = true;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'ok' }),
        };
      });

      service.onModuleInit();

      // Destroy immediately before 3000ms bootstrap timer fires
      service.onModuleDestroy();

      // Fast-forward past 3000ms
      vi.advanceTimersByTime(5000);

      expect(probeCalled).toBe(false);
    });

    it('aborts in-flight fetch and prevents state mutation after module destruction', async () => {
      let aborted = false;
      global.fetch = vi.fn().mockImplementation(async (_url: any, opts: any) => {
        const signal: AbortSignal = opts.signal;
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        // Long-running fetch
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'ok' }),
        };
      });

      service.onModuleInit();
      const probePromise = service.probeNow();

      // Destroy while probe is running
      service.onModuleDestroy();

      // Advance timers
      vi.advanceTimersByTime(6000);
      await probePromise;

      expect(aborted).toBe(true);
    });
  });
});
