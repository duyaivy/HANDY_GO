import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OrderClient } from './order.client.js';
import { BiddingClient } from './bidding.client.js';
import { MatchingClient } from './matching.client.js';
import { AppException } from '@app/common';
import type { ConfigService } from '@app/config';

describe('Candidate Aggregation HTTP Clients', () => {
  const mockConfig = {
    getUrl: vi.fn((key: string) => {
      if (key === 'ORDER_SERVICE_URL') return 'http://order-service:3004';
      if (key === 'BIDDING_SERVICE_URL') return 'http://bidding-service:3005';
      if (key === 'MATCHING_SERVICE_URL') return 'http://matching-service:3006';
      return 'http://localhost';
    }),
    internalServiceSecret: 'test-secret',
    upstreamTimeoutMs: 1000,
  } as unknown as ConfigService;

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('OrderClient', () => {
    it('returns service request data on 200 OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          data: { id: 'req-1', customerUserId: 'cust-1', status: 'open_for_bidding' },
        }),
      });

      const client = new OrderClient(mockConfig);
      const data = await client.getServiceRequest('req-1', {
        userId: 'cust-1',
        roles: ['Customer'],
      });

      expect(data.id).toBe('req-1');
      expect(data.customerUserId).toBe('cust-1');
    });

    it('throws 404 NOT_FOUND on Order Service 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
      });

      const client = new OrderClient(mockConfig);
      await expect(
        client.getServiceRequest('req-404', { userId: 'cust-1', roles: ['Customer'] }),
      ).rejects.toThrow(AppException);
    });

    it('throws 403 FORBIDDEN on Order Service 403', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 403,
      });

      const client = new OrderClient(mockConfig);
      await expect(
        client.getServiceRequest('req-403', { userId: 'cust-1', roles: ['Customer'] }),
      ).rejects.toThrow(AppException);
    });

    it('throws BAD_GATEWAY on Order Service connection failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const client = new OrderClient(mockConfig);
      await expect(
        client.getServiceRequest('req-err', { userId: 'cust-1', roles: ['Customer'] }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('BiddingClient', () => {
    it('returns bids and status when both succeed', async () => {
      global.fetch = vi.fn((url: string) => {
        if (url.includes('/bidding-status')) {
          return Promise.resolve({
            status: 200,
            json: async () => ({ data: { status: 'open', closesAt: '2026-10-29T10:00:00.000Z' } }),
          });
        }
        return Promise.resolve({
          status: 200,
          json: async () => ({
            data: {
              items: [{ id: 'b1', workerId: 'w1', amount: 200000 }],
              total: 1,
              page: 1,
              limit: 20,
            },
          }),
        });
      }) as any;

      const client = new BiddingClient(mockConfig);
      const res = await client.getBidsAndStatus(
        'req-1',
        { page: 1, limit: 20 },
        { userId: 'cust-1', roles: ['Customer'] },
      );

      expect(res.status).toBe('open');
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
    });

    it('handles 404 bidding-status as pending', async () => {
      global.fetch = vi.fn((url: string) => {
        if (url.includes('/bidding-status')) {
          return Promise.resolve({ status: 404 });
        }
        return Promise.resolve({
          status: 200,
          json: async () => ({ data: { items: [], total: 0 } }),
        });
      }) as any;

      const client = new BiddingClient(mockConfig);
      const res = await client.getBidsAndStatus(
        'req-1',
        { page: 1, limit: 20 },
        { userId: 'cust-1', roles: ['Customer'] },
      );

      expect(res.status).toBe('pending');
      expect(res.items).toHaveLength(0);
    });

    it('handles Bidding Service failure gracefully (returns unavailable status)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection timeout'));

      const client = new BiddingClient(mockConfig);
      const res = await client.getBidsAndStatus(
        'req-1',
        { page: 1, limit: 20 },
        { userId: 'cust-1', roles: ['Customer'] },
      );

      expect(res.status).toBe('unavailable');
      expect(res.error).toBeDefined();
      expect(res.items).toHaveLength(0);
    });
  });

  describe('MatchingClient', () => {
    it('returns recommendations on 200 OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          status: 'completed',
          recommendations: [{ matchResultId: 'm1', workerUserId: 'w1', rank: 1, matchingScore: 90 }],
          modelVersion: 'model-v1',
          generatedAt: '2026-10-28T10:00:00.000Z',
        }),
      });

      const client = new MatchingClient(mockConfig);
      const res = await client.getRecommendations('req-1');

      expect(res.status).toBe('completed');
      expect(res.recommendations).toHaveLength(1);
      expect(res.modelVersion).toBe('model-v1');
    });

    it('explicitly handles 404 from Matching internal endpoint as processing without error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
      });

      const client = new MatchingClient(mockConfig);
      const res = await client.getRecommendations('req-1');

      expect(res.status).toBe('processing');
      expect(res.recommendations).toHaveLength(0);
      expect(res.error).toBeUndefined();
    });

    it('handles Matching Service connection failure gracefully (returns unavailable status)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = new MatchingClient(mockConfig);
      const res = await client.getRecommendations('req-1');

      expect(res.status).toBe('unavailable');
      expect(res.recommendations).toHaveLength(0);
      expect(res.error).toContain('Matching service unavailable');
    });
  });
});
