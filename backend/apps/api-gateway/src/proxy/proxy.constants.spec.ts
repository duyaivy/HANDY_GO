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
});
