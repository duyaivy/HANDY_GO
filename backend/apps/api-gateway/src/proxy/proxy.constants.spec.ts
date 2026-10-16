import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { SERVICE_ROUTES } from './proxy.constants.js';

describe('AI identity proxy route', () => {
  const route = SERVICE_ROUTES.find((serviceRoute) => serviceRoute.upstreamName === 'ai-service');

  it('rewrites to the authenticated user endpoint and preserves the query', () => {
    const rewrite = route?.pathRewrite;
    expect(rewrite).toBeDefined();
    expect(
      rewrite?.('/api/v1/identity/verify?source=mobile', {
        headers: { 'x-user-id': 'user/id' },
      } as Request),
    ).toBe('/api/identity/user%2Fid/verify?source=mobile');
  });

  it('rewrites job status check path', () => {
    const rewrite = route?.pathRewrite;
    expect(
      rewrite?.('/api/v1/identity/jobs/abc12345', {
        headers: { 'x-user-id': 'user1' },
      } as Request),
    ).toBe('/api/identity/jobs/abc12345');
  });

  it('rewrites result verification path', () => {
    const rewrite = route?.pathRewrite;
    expect(
      rewrite?.('/api/v1/identity/verify/res123', {
        headers: { 'x-user-id': 'user1' },
      } as Request),
    ).toBe('/api/identity/verify/res123');
  });

  it('preserves admin identity route', () => {
    const rewrite = route?.pathRewrite;
    expect(
      rewrite?.('/api/v1/admin/identity/pending', {
        headers: {},
      } as Request),
    ).toBe('/api/v1/admin/identity/pending');
  });
});
