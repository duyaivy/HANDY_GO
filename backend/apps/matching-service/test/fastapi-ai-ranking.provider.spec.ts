import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastApiAiRankingProvider } from '../src/ranking/fastapi-ai-ranking.provider.js';
import type { RankingRequestDto, RankingResponseDto } from '../src/ranking/ranking.dto.js';

describe('FastApiAiRankingProvider', () => {
  let provider: FastApiAiRankingProvider;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_SERVICE_URL = 'http://localhost:8000';
    process.env.AI_SERVICE_TIMEOUT_MS = '5000';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-xyz';
    provider = new FastApiAiRankingProvider();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should initialize with correct configuration from environment', () => {
    expect(provider.providerType).toBe('real_ai');
    expect(provider.modelVersion).toContain('multilingual-e5-small');
  });

  it('should send authenticated POST request to FastAPI AI service', async () => {
    const mockRequest: RankingRequestDto = {
      serviceRequestId: 'req-001',
      requestRevision: 1,
      serviceId: 'srv-ac',
      requestDescription: 'Sửa máy lạnh',
      requestLatitude: 10.772,
      requestLongitude: 106.698,
      candidates: [
        {
          workerUserId: 'worker-1',
          offeringTitle: 'Thợ sửa máy lạnh',
          offeringDescription: 'Chuyên sửa điều hòa',
          distanceKm: 2.0,
          radiusKm: 10.0,
          averageRating: 4.8,
          ratingCount: 20,
          experienceYears: 5,
          historicalCompletionRate: 0.95,
        },
      ],
      topN: 20,
    };

    const mockResponse: RankingResponseDto = {
      modelVersion: 'intfloat/multilingual-e5-small-hybrid-v1.0',
      providerType: 'real_ai',
      generatedAt: new Date().toISOString(),
      rankedWorkers: [
        {
          workerUserId: 'worker-1',
          rank: 1,
          matchingScore: 88.5,
          scoreBreakdown: {
            semanticScore: 85.0,
            geoScore: 80.0,
            ratingScore: 92.0,
            experienceScore: 50.0,
            completionScore: 95.0,
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    const result = await provider.rank(mockRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callOptions] = fetchSpy.mock.calls[0];
    expect(callUrl).toBe('http://localhost:8000/internal/ai/matching/rank');
    expect(callOptions?.method).toBe('POST');
    const headers = callOptions?.headers as Record<string, string>;
    expect(headers?.['x-internal-secret']).toBe(
      'test-internal-secret-xyz',
    );
    expect(result.rankedWorkers).toHaveLength(1);
    expect(result.rankedWorkers[0].workerUserId).toBe('worker-1');
  });

  it('should immediately fail on 403 Forbidden without retrying', async () => {
    const mockRequest: RankingRequestDto = {
      serviceRequestId: 'req-002',
      requestRevision: 1,
      serviceId: 'srv-ac',
      requestDescription: 'Sửa máy lạnh',
      requestLatitude: 10.772,
      requestLongitude: 106.698,
      candidates: [],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: Invalid internal secret',
    } as any);

    await expect(provider.rank(mockRequest)).rejects.toThrow(/HTTP 403/);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // No retry on 403
  });

  it('should retry once on 5xx server errors before throwing', async () => {
    const mockRequest: RankingRequestDto = {
      serviceRequestId: 'req-003',
      requestRevision: 1,
      serviceId: 'srv-ac',
      requestDescription: 'Sửa máy lạnh',
      requestLatitude: 10.772,
      requestLongitude: 106.698,
      candidates: [],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Model Loading in Progress',
    } as any);

    await expect(provider.rank(mockRequest)).rejects.toThrow(/HTTP 503/);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // Retried once (total 2 attempts)
  });
});
