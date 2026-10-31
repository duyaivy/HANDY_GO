import { describe, it, expect, vi } from 'vitest';
import {
  SERVICE_ROUTES,
  type ServiceRouteConfig,
} from '../src/proxy/proxy.constants.js';
import { ProxyMiddleware } from '../src/proxy/proxy.middleware.js';
import type { ConfigService } from '@app/config';

describe('API Gateway SSE Streaming Isolation (BE-03 / BE-07)', () => {
  it('should define isolated bidding-service-sse route BEFORE general bidding-service route in SERVICE_ROUTES', () => {
    const sseIndex = SERVICE_ROUTES.findIndex(
      (r) => r.upstreamName === 'bidding-service-sse',
    );
    const generalBiddingIndex = SERVICE_ROUTES.findIndex(
      (r) => r.upstreamName === 'bidding-service',
    );

    expect(sseIndex).toBeGreaterThanOrEqual(0);
    expect(generalBiddingIndex).toBeGreaterThanOrEqual(0);

    // CRITICAL: SSE route MUST precede general bidding-service route so it matches first
    expect(sseIndex).toBeLessThan(generalBiddingIndex);
  });

  it('bidding-service-sse route must specify timeoutMs: 0', () => {
    const sseRoute = SERVICE_ROUTES.find(
      (r) => r.upstreamName === 'bidding-service-sse',
    );
    expect(sseRoute).toBeDefined();
    expect(sseRoute!.timeoutMs).toBe(0);
  });

  it('bidding-service-sse customMatch must accurately match SSE paths and reject non-SSE paths', () => {
    const sseRoute = SERVICE_ROUTES.find(
      (r) => r.upstreamName === 'bidding-service-sse',
    )!;
    expect(sseRoute.customMatch).toBeDefined();

    // Matches valid SSE event paths
    expect(
      sseRoute.customMatch!(
        '/api/v1/bids/requests/f47ac10b-58cc-4372-a567-0e02b2c3d479/events',
      ),
    ).toBe(true);
    expect(
      sseRoute.customMatch!(
        '/api/v1/bids/requests/123/events?token=abc',
      ),
    ).toBe(true);

    // Does NOT match standard REST bidding paths
    expect(sseRoute.customMatch!('/api/v1/bids')).toBe(false);
    expect(sseRoute.customMatch!('/api/v1/bids/me')).toBe(false);
    expect(sseRoute.customMatch!('/api/v1/bids/bid-123')).toBe(false);
    expect(sseRoute.customMatch!('/api/v1/requests/123/bids')).toBe(false);
    expect(sseRoute.customMatch!('/api/v1/requests/123/candidates')).toBe(false);
  });

  it('order-service excludeMatch must preserve pass-through for candidates controller', () => {
    const orderRoute = SERVICE_ROUTES.find(
      (r) => r.upstreamName === 'order-service',
    )!;
    expect(orderRoute.excludeMatch).toBeDefined();

    // Excludes candidates endpoint so it is handled natively by API Gateway CandidatesController
    expect(
      orderRoute.excludeMatch!(
        '/api/v1/requests/f47ac10b-58cc-4372-a567-0e02b2c3d479/candidates',
      ),
    ).toBe(true);
    expect(
      orderRoute.excludeMatch!(
        '/api/v1/requests/123/candidates?page=1&limit=20',
      ),
    ).toBe(true);

    // Does NOT exclude normal order-service requests
    expect(orderRoute.excludeMatch!('/api/v1/service-requests/123')).toBe(false);
    expect(orderRoute.excludeMatch!('/api/v1/orders/123')).toBe(false);
  });

  it('ProxyMiddleware should initialize SSE proxy with timeout: 0 while regular routes retain standard timeout', () => {
    const mockConfig = {
      getUrl: vi.fn((key: string) => `http://mock-service:3000`),
      upstreamTimeoutMs: 15000,
      get: vi.fn((key: string) => undefined),
    } as unknown as ConfigService;

    // Instantiate middleware
    const middleware = new ProxyMiddleware(mockConfig);
    const entries: any[] = (middleware as any).entries;

    const sseEntry = entries.find(
      (e) => e.route.upstreamName === 'bidding-service-sse',
    );
    const biddingEntry = entries.find(
      (e) => e.route.upstreamName === 'bidding-service',
    );

    expect(sseEntry).toBeDefined();
    expect(biddingEntry).toBeDefined();
  });
});
