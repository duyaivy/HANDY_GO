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

function verifier(
  orderUrl = 'http://order-service:3004/',
  userTrustUrl = 'http://user-trust-service:3002/',
) {
  const config = {
    getUrl: vi.fn((key: string) => {
      if (key === 'USER_TRUST_SERVICE_URL') return userTrustUrl;
      return orderUrl;
    }),
    internalServiceSecret: secret,
  } as unknown as ConfigService;
  return new RequestEligibilityVerifierService(config);
}

function mockResponse(status: number, body?: unknown): Response {
  return { status, json: vi.fn(async () => body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('RequestEligibilityVerifierService', () => {
  describe('verifyEligibility (Order Service)', () => {
    it('uses configured URL, trusted secret and worker identity for an eligible response with serviceId', async () => {
      const fetchMock = vi.fn(async () =>
        mockResponse(200, {
          data: { eligible: true, serviceId: 'srv-plumbing' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        verifier().verifyEligibility(requestId, workerId),
      ).resolves.toEqual({ eligible: true, serviceId: 'srv-plumbing' });
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

    it('rejects an ineligible worker as a business failure (HTTP 403)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { eligible: false, reason: 'Own request' },
          }),
        ),
      );
      await expect(
        verifier().verifyEligibility(requestId, workerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('fails closed when Order Service returns eligible: true but lacks serviceId', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { eligible: true }, // missing serviceId
          }),
        ),
      );
      await expect(
        verifier().verifyEligibility(requestId, workerId),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it.each(['', '   ', 'invalid!char@#', 'bad id with spaces'])(
      'fails closed when Order Service returns eligible: true but serviceId has invalid format "%s"',
      async (invalidServiceId) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
            mockResponse(200, {
              data: { eligible: true, serviceId: invalidServiceId },
            }),
          ),
        );
        await expect(
          verifier().verifyEligibility(requestId, workerId),
        ).rejects.toThrow(ServiceUnavailableException);
      },
    );

    it.each([401, 403, 404])(
      'rejects HTTP %i without allowing a bid (HTTP 403)',
      async (status) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => mockResponse(status)),
        );
        await expect(
          verifier().verifyEligibility(requestId, workerId),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it.each([500, 503])('fails closed on HTTP %i from Order Service', async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => mockResponse(status)),
      );
      await expect(
        verifier().verifyEligibility(requestId, workerId),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('fails closed on connection refusal to Order Service', async () => {
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

    it('fails closed on timeout to Order Service', async () => {
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

    it('fails closed on an invalid 200 response from Order Service', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => mockResponse(200, { data: { isEligible: true } })),
      );
      await expect(
        verifier().verifyEligibility(requestId, workerId),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('verifyWorkerHardEligibility (User & Trust Service)', () => {
    it('uses configured USER_TRUST_SERVICE_URL and secret to verify profile when KYC approved and matching service', async () => {
      const fetchMock = vi.fn(async () =>
        mockResponse(200, {
          data: { isVerified: true, serviceIds: ['srv-plumbing'] },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        `http://user-trust-service:3002/api/v1/internal/v1/workers/${workerId}/matching-profile`,
      );
      expect(options.method).toBe('GET');
      expect(options.headers).toEqual({ 'x-internal-secret': secret });
    });

    it('rejects worker when KYC is not verified / pending (HTTP 403)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { isVerified: false, serviceIds: ['srv-plumbing'] },
          }),
        ),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects worker when required service is not offered (HTTP 403)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { isVerified: true, serviceIds: ['srv-other'] },
          }),
        ),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects worker when worker has empty serviceIds array (HTTP 403)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { isVerified: true, serviceIds: [] },
          }),
        ),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('fails closed when User Trust profile is missing serviceIds field', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { isVerified: true }, // missing serviceIds
          }),
        ),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('fails closed when User Trust profile serviceIds is not an array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          mockResponse(200, {
            data: { isVerified: true, serviceIds: 'srv-plumbing' },
          }),
        ),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it.each(['', '   ', 'invalid!id@'])(
      'fails closed when requiredServiceId is invalid format "%s"',
      async (invalidServiceId) => {
        await expect(
          verifier().verifyWorkerHardEligibility(workerId, invalidServiceId),
        ).rejects.toThrow(ServiceUnavailableException);
      },
    );

    it('rejects worker when profile is not found (HTTP 404)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => mockResponse(404, { message: 'Not found' })),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ForbiddenException);
    });

    it.each([401, 403])(
      'rejects when User Trust returns auth failure HTTP %i (HTTP 403)',
      async (status) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => mockResponse(status)),
        );

        await expect(
          verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it.each([500, 502, 503])(
      'fails closed on HTTP %i from User & Trust',
      async (status) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => mockResponse(status)),
        );

        await expect(
          verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
        ).rejects.toThrow(ServiceUnavailableException);
      },
    );

    it('fails closed on network / connection error to User & Trust', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('fetch ECONNREFUSED');
        }),
      );

      await expect(
        verifier().verifyWorkerHardEligibility(workerId, 'srv-plumbing'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Startup Fail-Fast Validation', () => {
    it('fails startup validation without ORDER_SERVICE_URL', async () => {
      vi.stubEnv('ORDER_SERVICE_URL', ' ');
      vi.stubEnv('USER_TRUST_SERVICE_URL', 'http://user-trust-service:3002');
      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              serviceName: 'bidding-service',
              defaultPort: 3005,
              requiredUrls: ['ORDER_SERVICE_URL', 'USER_TRUST_SERVICE_URL'],
            }),
          ],
        }).compile(),
      ).rejects.toThrow('ORDER_SERVICE_URL is required');
    });

    it('fails startup validation without USER_TRUST_SERVICE_URL', async () => {
      vi.stubEnv('ORDER_SERVICE_URL', 'http://order-service:3004');
      vi.stubEnv('USER_TRUST_SERVICE_URL', ' ');
      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              serviceName: 'bidding-service',
              defaultPort: 3005,
              requiredUrls: ['ORDER_SERVICE_URL', 'USER_TRUST_SERVICE_URL'],
            }),
          ],
        }).compile(),
      ).rejects.toThrow('USER_TRUST_SERVICE_URL is required');
    });
  });
});
