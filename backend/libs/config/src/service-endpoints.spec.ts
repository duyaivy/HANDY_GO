import { describe, expect, it } from 'vitest';
import { validateProductionServiceEndpoints } from './service-endpoints.js';

describe('production service topology', () => {
  const ai = 'https://ai-fixture.region.azurecontainerapps.io';
  const config = { NODE_ENV: 'production', AI_SERVICE_URL: ai,
    USER_TRUST_SERVICE_URL: 'http://10.77.0.1:3002' };

  it('requires WireGuard routing for every User Trust caller, including the gateway', () => {
    for (const caller of ['api-gateway', 'matching-service', 'bidding-service', 'wallet-service']) {
      expect(() => validateProductionServiceEndpoints({ ...config,
        USER_TRUST_SERVICE_URL: 'http://user-trust-service:3002' }, caller)).toThrow();
    }
    expect(() => validateProductionServiceEndpoints(config, 'matching-service')).not.toThrow();
    expect(() => validateProductionServiceEndpoints(config, 'wallet-service')).not.toThrow();
  });

  it('prevents missing Order URLs and wrong Matching ports from activating local fallbacks', () => {
    expect(() => validateProductionServiceEndpoints(config, 'order-service')).toThrow('BIDDING_SERVICE_URL');
    expect(() => validateProductionServiceEndpoints({ ...config,
      BIDDING_SERVICE_URL: 'http://10.77.0.2:3005', MATCHING_SERVICE_URL: 'http://10.77.0.2:3004',
    }, 'order-service')).toThrow('MATCHING_SERVICE_URL');
  });

  it('rejects credential/path/query origins and missing AI configuration', () => {
    for (const value of ['http://secret@10.77.0.1:3002', 'http://10.77.0.1:3002/api/v1', 'http://10.77.0.1:3002?q=x']) {
      expect(() => validateProductionServiceEndpoints({ ...config, USER_TRUST_SERVICE_URL: value }, 'wallet-service')).toThrow();
    }
    expect(() => validateProductionServiceEndpoints({ ...config, AI_SERVICE_URL: '' }, 'matching-service')).toThrow('AI_SERVICE_URL');
    expect(() => validateProductionServiceEndpoints({ ...config, AI_SERVICE_URL: 'http://localhost:8000' }, 'user-trust-service')).toThrow('AI_SERVICE_URL');
  });

  it('preserves local development URLs', () => {
    expect(() => validateProductionServiceEndpoints({ NODE_ENV: 'development' }, 'matching-service')).not.toThrow();
  });
});
