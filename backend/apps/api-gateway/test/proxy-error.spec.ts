import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@app/config';
import { ProxyMiddleware } from '../src/proxy/proxy.middleware.js';

const { options } = vi.hoisted(() => ({ options: [] as any[] }));
vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: vi.fn((config) => {
    options.push(config);
    return vi.fn();
  }),
  fixRequestBody: vi.fn(),
}));

afterEach(() => {
  options.length = 0;
  vi.restoreAllMocks();
});

describe('Proxy error diagnostics', () => {
  it('records the underlying error code and request ID without credentials or query values', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    new ProxyMiddleware({
      getUrl: () => 'http://notification-service:3008',
      get: () => undefined,
      upstreamTimeoutMs: 15000,
    } as unknown as ConfigService);
    const json = vi.fn();
    const res = { writeHead: vi.fn(), headersSent: false, status: vi.fn(() => ({ json })) };
    const error = Object.assign(new Error('sensitive upstream details'), { code: 'ECONNREFUSED' });
    const config = options.find((entry) => entry.target === 'http://notification-service:3008');
    config.on.error(error, {
      method: 'GET',
      originalUrl: '/api/v1/notifications?token=secret-query',
      headers: { 'x-request-id': 'request-123', authorization: 'Bearer secret-token', 'x-user-roles': 'Khách hàng Việt' },
    }, res);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'ECONNREFUSED', requestId: 'request-123',
      method: 'GET', path: '/api/v1/notifications',
      invalidHeaders: ['x-user-roles'],
    }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-query|secret-token|sensitive upstream details/);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(json.mock.calls[0][0].data.requestId).toBe('request-123');
  });
});
