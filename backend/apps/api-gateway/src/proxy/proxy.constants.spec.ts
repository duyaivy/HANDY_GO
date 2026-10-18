import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { SERVICE_ROUTES } from './proxy.constants.js';

describe('AI identity proxy route', () => {
  const route = SERVICE_ROUTES.find((serviceRoute) => serviceRoute.upstreamName === 'ai-service');

  it('configures direct 1:1 passthrough without path rewriting', () => {
    expect(route).toBeDefined();
    expect(route?.pathRewrite).toBeUndefined();
  });

  it('includes both versioned and legacy identity prefixes', () => {
    expect(route?.prefixes).toContain('/api/v1/identity');
    expect(route?.prefixes).toContain('/api/v1/admin/identity');
    expect(route?.prefixes).toContain('/api/v1/ocr');
    expect(route?.prefixes).toContain('/api/identity');
    expect(route?.prefixes).toContain('/ocr');
  });
});
