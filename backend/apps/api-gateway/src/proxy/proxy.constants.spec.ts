import { describe, expect, it } from 'vitest';
import { SERVICE_ROUTES } from './proxy.constants.js';

describe('AI identity proxy route', () => {
  const route = SERVICE_ROUTES.find((serviceRoute) => serviceRoute.upstreamName === 'ai-service');

  it('configures direct 1:1 passthrough without path rewriting', () => {
    expect(route).toBeDefined();
    expect(route?.pathRewrite).toBeUndefined();
  });

  it('includes OCR prefixes for AI service and excludes identity prefixes', () => {
    expect(route?.prefixes).toContain('/api/v1/ocr');
    expect(route?.prefixes).toContain('/ocr');
    expect(route?.prefixes).not.toContain('/api/v1/identity');
    expect(route?.prefixes).not.toContain('/api/identity');
  });

  it('routes /api/v1/admin/kyc-cases to user-trust-service', () => {
    const userTrustRoute = SERVICE_ROUTES.find(
      (r) => r.upstreamName === 'user-trust-service',
    );
    expect(userTrustRoute?.prefixes).toContain('/api/v1/admin/kyc-cases');
  });

  it('correctly isolates bidding subroutes and general request CRUD routes', () => {
    const biddingRoute = SERVICE_ROUTES.find(
      (r) => r.upstreamName === 'bidding-service',
    );
    const orderRoute = SERVICE_ROUTES.find(
      (r) => r.upstreamName === 'order-service',
    );

    expect(biddingRoute).toBeDefined();
    expect(orderRoute).toBeDefined();
    expect(orderRoute?.prefixes).toContain('/api/v1/requests');
    expect(biddingRoute?.prefixes).toContain('/api/v1/bids');
    expect(biddingRoute?.prefixes).not.toContain('/api/v1/requests');

    // customMatch tests for bidding
    expect(biddingRoute?.customMatch?.('/api/v1/bids')).toBe(true);
    expect(biddingRoute?.customMatch?.('/api/v1/bids/123')).toBe(true);
    expect(
      biddingRoute?.customMatch?.(
        '/api/v1/requests/69b2d3c0-21a4-4a25-83c9-9486c9da391b/bids',
      ),
    ).toBe(true);
    expect(
      biddingRoute?.customMatch?.(
        '/api/v1/requests/69b2d3c0-21a4-4a25-83c9-9486c9da391b/bidding-status',
      ),
    ).toBe(true);

    // General request CRUD routes should NOT match bidding
    expect(biddingRoute?.customMatch?.('/api/v1/requests')).toBe(false);
    expect(
      biddingRoute?.customMatch?.(
        '/api/v1/requests/69b2d3c0-21a4-4a25-83c9-9486c9da391b',
      ),
    ).toBe(false);
  });
});
