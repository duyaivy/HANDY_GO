import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@app/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestEligibilityVerifierService } from './request-eligibility-verifier.service.js';

const requestId = 'a7c83b52-5af5-4522-af0d-da8cf914a98f';
const workerId = 'f80f4949-827e-4bdf-9d30-0630a12b9654';
const secret = 'test-internal-secret';

function verifier(url = 'http://order-service:3004/') {
  const config = {
    getUrl: vi.fn(() => url),
    internalServiceSecret: secret,
  } as unknown as ConfigService;
  return new RequestEligibilityVerifierService(config);
}

function orderResponse(status: number, body?: unknown): Response {
  return { status, json: vi.fn(async () => body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('RequestEligibilityVerifierService', () => {
  it('uses configured URL, trusted secret and worker identity for an eligible response', async () => {
    const fetchMock = vi.fn(async () =>
      orderResponse(200, { data: { eligible: true } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      verifier().verifyEligibility(requestId, workerId),
    ).resolves.toEqual({ eligible: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `http://order-service:3004/api/v1/internal/service-requests/${requestId}/bidding-eligibility?workerId=${workerId}`,
    );
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({ 'x-internal-secret': secret });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects an ineligible worker as a business failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        orderResponse(200, {
          data: { eligible: false, reason: 'Own request' },
        }),
      ),
    );
    await expect(
      verifier().verifyEligibility(requestId, workerId),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([401, 403, 404])(
    'rejects HTTP %i without allowing a bid',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => orderResponse(status)),
      );
      await expect(
        verifier().verifyEligibility(requestId, workerId),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it.each([500, 503])('fails closed on HTTP %i', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => orderResponse(status)),
    );
    await expect(
      verifier().verifyEligibility(requestId, workerId),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed on connection refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('fetch failed'), {
          cause: { code: 'ECONNREFUSED' },
        });
      }),
    );
    await expect(
      verifier().verifyEligibility(requestId, workerId),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed on timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('timeout', 'TimeoutError');
      }),
    );
    await expect(
      verifier().verifyEligibility(requestId, workerId),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed on an invalid 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => orderResponse(200, { data: { isEligible: true } })),
    );
    await expect(
      verifier().verifyEligibility(requestId, workerId),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails startup validation without ORDER_SERVICE_URL', async () => {
    vi.stubEnv('ORDER_SERVICE_URL', ' ');
    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            serviceName: 'bidding-service',
            defaultPort: 3005,
            requiredUrls: ['ORDER_SERVICE_URL'],
          }),
        ],
      }).compile(),
    ).rejects.toThrow('ORDER_SERVICE_URL is required');
  });
});
