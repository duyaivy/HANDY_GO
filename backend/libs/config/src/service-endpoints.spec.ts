import { describe, expect, it } from 'vitest';
import { validateProductionServiceEndpoints } from './service-endpoints.js';

describe('production service topology', () => {
  const ai = 'https://ai-fixture.region.azurecontainerapps.io';
  const config = {
    NODE_ENV: 'production',
    AI_SERVICE_URL: ai,
    USER_TRUST_SERVICE_URL: 'http://10.77.0.1:3002',
    CATALOG_SERVICE_URL: 'http://10.77.0.3:3003',
    ORDER_SERVICE_URL: 'http://10.77.0.2:3004',
  };

  it('enforces same VPS -> Docker DNS and different VPS -> WireGuard IP', () => {
    // Cross-host callers must use WireGuard IP and reject Docker DNS
    for (const caller of ['matching-service', 'bidding-service', 'wallet-service']) {
      expect(() => validateProductionServiceEndpoints({ ...config,
        USER_TRUST_SERVICE_URL: 'http://user-trust-service:3002' }, caller)).toThrow(/over WireGuard/);
      expect(() => validateProductionServiceEndpoints(config, caller)).not.toThrow();
    }

    // Same-host caller (Gateway on VPS1) must use Docker DNS and reject WireGuard IP
    const gatewayUserTrust = {
      ...config,
      AUTH_SERVICE_URL: 'http://auth-service:3001',
      NOTIFICATION_SERVICE_URL: 'http://notification-service:3008',
      BIDDING_SERVICE_URL: 'http://10.77.0.2:3005',
      MATCHING_SERVICE_URL: 'http://10.77.0.2:3006',
      TRACKING_SERVICE_URL: 'http://10.77.0.2:3010',
      PAYMENT_SERVICE_URL: 'http://10.77.0.3:3007',
      WALLET_SERVICE_URL: 'http://10.77.0.3:3009',
      MESSAGE_SERVICE_URL: 'http://10.77.0.4:3009',
    };
    expect(() => validateProductionServiceEndpoints({ ...gatewayUserTrust,
      USER_TRUST_SERVICE_URL: 'http://10.77.0.1:3002' }, 'api-gateway')).toThrow(/using same-host Docker DNS/);
    expect(() => validateProductionServiceEndpoints({ ...gatewayUserTrust,
      USER_TRUST_SERVICE_URL: 'http://user-trust-service:3002' }, 'api-gateway')).not.toThrow();
  });

  it('validates Message Service on VPS4 uses WireGuard for Auth and User Trust', () => {
    const messageConfig = {
      ...config,
      MEDIA_SERVICE_URL: 'http://10.77.0.1:3000',
      AUTH_SERVICE_URL: 'http://10.77.0.1:3001',
      USER_TRUST_SERVICE_URL: 'http://10.77.0.1:3002',
      ORDER_SERVICE_URL: 'http://10.77.0.2:3004',
      BIDDING_SERVICE_URL: 'http://10.77.0.2:3005',
    };
    expect(() => validateProductionServiceEndpoints(messageConfig, 'message-service')).not.toThrow();

    expect(() => validateProductionServiceEndpoints({
      ...messageConfig,
      AUTH_SERVICE_URL: 'http://auth-service:3001',
    }, 'message-service')).toThrow(/over WireGuard/);

    expect(() => validateProductionServiceEndpoints({
      ...messageConfig,
      USER_TRUST_SERVICE_URL: 'http://user-trust-service:3002',
    }, 'message-service')).toThrow(/over WireGuard/);
  });

  it('prevents missing Order URLs and wrong Matching ports from activating local fallbacks', () => {
    const withoutOrder = { ...config };
    delete (withoutOrder as Record<string, unknown>).ORDER_SERVICE_URL;
    expect(() => validateProductionServiceEndpoints(withoutOrder, 'order-service')).toThrow('BIDDING_SERVICE_URL');
    expect(() => validateProductionServiceEndpoints({ ...withoutOrder,
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

  it('validates Gateway overrides same-host services with Docker DNS and uses WireGuard for remote services', () => {
    const gatewayConfig = {
      ...config,
      AUTH_SERVICE_URL: 'http://auth-service:3001',
      USER_TRUST_SERVICE_URL: 'http://user-trust-service:3002',
      NOTIFICATION_SERVICE_URL: 'http://notification-service:3008',
      ORDER_SERVICE_URL: 'http://10.77.0.2:3004',
      BIDDING_SERVICE_URL: 'http://10.77.0.2:3005',
      MATCHING_SERVICE_URL: 'http://10.77.0.2:3006',
      TRACKING_SERVICE_URL: 'http://10.77.0.2:3010',
      PAYMENT_SERVICE_URL: 'http://10.77.0.3:3007',
      WALLET_SERVICE_URL: 'http://10.77.0.3:3009',
      MESSAGE_SERVICE_URL: 'http://10.77.0.4:3009',
    };

    expect(() =>
      validateProductionServiceEndpoints(gatewayConfig, 'api-gateway'),
    ).not.toThrow();

    // Gateway must reject WireGuard URLs for same-host VPS1 services
    expect(() =>
      validateProductionServiceEndpoints(
        { ...gatewayConfig, AUTH_SERVICE_URL: 'http://10.77.0.1:3001' },
        'api-gateway',
      ),
    ).toThrow(/using same-host Docker DNS/);

    expect(() =>
      validateProductionServiceEndpoints(
        { ...gatewayConfig, USER_TRUST_SERVICE_URL: 'http://10.77.0.1:3002' },
        'api-gateway',
      ),
    ).toThrow(/using same-host Docker DNS/);

    expect(() =>
      validateProductionServiceEndpoints(
        { ...gatewayConfig, NOTIFICATION_SERVICE_URL: 'http://10.77.0.1:3008' },
        'api-gateway',
      ),
    ).toThrow(/using same-host Docker DNS/);

    // Gateway must reject Docker DNS for cross-host services
    expect(() =>
      validateProductionServiceEndpoints(
        { ...gatewayConfig, MESSAGE_SERVICE_URL: 'http://message-service:3009' },
        'api-gateway',
      ),
    ).toThrow(/over WireGuard/);

    expect(() =>
      validateProductionServiceEndpoints(
        { ...gatewayConfig, ORDER_SERVICE_URL: 'http://order-service:3004' },
        'api-gateway',
      ),
    ).toThrow(/over WireGuard/);
  });
});
