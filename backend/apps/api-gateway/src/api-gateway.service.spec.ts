import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { ApiGatewayService } from './api-gateway.service.js';

describe('ApiGatewayService', () => {
  let config: ConfigService;
  let service: ApiGatewayService;

  beforeEach(() => {
    config = {
      getUrl: (key: string) =>
        key === 'AUTH_SERVICE_URL'
          ? 'http://auth-service:3001'
          : 'http://user-trust-service:3002',
      upstreamTimeoutMs: 100,
    } as unknown as ConfigService;
    service = new ApiGatewayService(config);
    vi.restoreAllMocks();
  });

  it('forwards auth health and request ID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: 'auth-service' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(service.getAuthHealth('request-123')).resolves.toEqual({
      status: 'ok',
      service: 'auth-service',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://auth-service:3001/health'),
      expect.objectContaining({ headers: { 'x-request-id': 'request-123' } }),
    );
  });

  it('forwards POST request to auth service with authorization and body', async () => {
    const responsePayload = { statusCode: 200, message: 'Success' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const body = { phone: '0912345678', password: 'Password123' };
    const result = await service.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/login',
      'POST',
      { authorization: 'Bearer mock-token', 'x-request-id': 'req-1' },
      body,
    );

    expect(result).toEqual(responsePayload);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://auth-service:3001/api/v1/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          authorization: 'Bearer mock-token',
          'x-request-id': 'req-1',
        }),
      }),
    );
  });

  it('preserves upstream error status code in HttpException', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: 'Duplicate phone' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.forwardRequest(
        'AUTH_SERVICE_URL',
        '/api/v1/auth/register',
        'POST',
        {},
        {},
      ),
    ).rejects.toThrow(HttpException);
  });

  it('returns a clear bad gateway error for an unavailable upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('connection refused'),
    );

    await expect(service.getAuthHealth()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('returns a gateway timeout error when the request times out', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('timed out', 'TimeoutError'),
    );

    await expect(service.getAuthHealth()).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });
});
