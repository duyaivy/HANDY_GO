import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { ApiGatewayService } from './api-gateway.service.js';

describe('ApiGatewayService', () => {
  const config = {
    getUrl: () => 'http://auth-service:3001',
    upstreamTimeoutMs: 100,
  } as ConfigService;
  const service = new ApiGatewayService(config);

  afterEach(() => {
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
