import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PricingEstimatorService } from './pricing-estimator.service.js';

describe('PricingEstimatorService', () => {
  let service: PricingEstimatorService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
    };

    service = new PricingEstimatorService(mockPrisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([undefined, '15000', 'invalid'])('returns catalog fallback within 5s with timeout %s', async (timeout) => {
    vi.useFakeTimers();
    vi.stubEnv('AI_PRICING_TIMEOUT_MS', timeout);
    vi.stubEnv('AI_SERVICE_TIMEOUT_MS', timeout);
    service = new PricingEstimatorService(mockPrisma);
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { id: 'service-1', name: 'Repair', base_price_min: 150000, base_price_max: 450000 },
    ]);
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    })));
    try {
      const pending = service.estimatePrice({ serviceId: 'service-1', description: 'Repair' });
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toMatchObject({
        aiRefPriceMin: 150000, aiRefPriceMax: 450000, isFallback: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('successfully returns estimated price range from AI Service', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        base_price_min: 150000,
        base_price_max: 450000,
      },
    ]);

    const mockAiResponse = {
      status: 'success',
      ai_ref_price_min: 200000,
      ai_ref_price_max: 350000,
      matched_case: 'Máy lạnh chảy nước, nghẹt ống thoát nước',
      confidence: 0.94,
      is_fallback: false,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockAiResponse),
    } as any);

    const result = await service.estimatePrice({
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      description: 'Máy lạnh bị chảy nước nhỏ giọt ngập sàn',
    });

    expect(result).toEqual({
      aiRefPriceMin: 200000,
      aiRefPriceMax: 350000,
      matchedReason: 'Máy lạnh chảy nước, nghẹt ống thoát nước',
      isFallback: false,
    });
  });

  it('falls back to catalog base prices when AI Service throws network error', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        base_price_min: 150000,
        base_price_max: 450000,
      },
    ]);

    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection refused'));

    const result = await service.estimatePrice({
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      description: 'Máy lạnh bị chảy nước',
    });

    expect(result).toEqual({
      aiRefPriceMin: 150000,
      aiRefPriceMax: 450000,
      matchedReason: undefined,
      isFallback: true,
    });
  });

  it('falls back to catalog base prices when AI Service responds with 500 error', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        base_price_min: 180000,
        base_price_max: 500000,
      },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as any);

    const result = await service.estimatePrice({
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      description: 'Máy lạnh',
    });

    expect(result.aiRefPriceMin).toBe(180000);
    expect(result.aiRefPriceMax).toBe(500000);
    expect(result.isFallback).toBe(true);
  });

  it('falls back to catalog base prices when AI payload has min >= max', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        base_price_min: 160000,
        base_price_max: 420000,
      },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        status: 'success',
        ai_ref_price_min: 500000,
        ai_ref_price_max: 300000,
      }),
    } as any);

    const result = await service.estimatePrice({
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      description: 'Máy lạnh',
    });

    expect(result.aiRefPriceMin).toBe(160000);
    expect(result.aiRefPriceMax).toBe(420000);
    expect(result.isFallback).toBe(true);
  });

  it('falls back to catalog base prices when AI payload has invalid or non-numeric types', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        base_price_min: 160000,
        base_price_max: 420000,
      },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        status: 'success',
        ai_ref_price_min: 'invalid',
        ai_ref_price_max: null,
      }),
    } as any);

    const result = await service.estimatePrice({
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      description: 'Máy lạnh',
    });

    expect(result.aiRefPriceMin).toBe(160000);
    expect(result.aiRefPriceMax).toBe(420000);
    expect(result.isFallback).toBe(true);
  });

  it('falls back to system baseline if catalog prices are also corrupted', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        base_price_min: 800000,
        base_price_max: 400000, // Corrupted catalog min > max
      },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        status: 'success',
        ai_ref_price_min: -10000,
        ai_ref_price_max: -5000,
      }),
    } as any);

    const result = await service.estimatePrice({
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      description: 'Máy lạnh',
    });

    expect(result.aiRefPriceMin).toBe(150000);
    expect(result.aiRefPriceMax).toBe(350000);
    expect(result.isFallback).toBe(true);
  });
});
