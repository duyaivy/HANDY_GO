import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import { BidsService } from '../src/bids/bids.service.js';
import { RoundsService } from '../src/rounds/rounds.service.js';
import { RequestEligibilityVerifierService } from '../src/bids/services/request-eligibility-verifier.service.js';

const TEST_SECRET = 'handygo-internal-test-secret';
const SERVICE_REQUEST_ID = 'req-1111-2222';
const WORKER_ID = 'worker-9999';
const SERVICE_ID = 'srv-air-conditioner';
const ORDER_SERVICE_URL = 'http://order-service:3004';
const USER_TRUST_SERVICE_URL = 'http://user-trust-service:3002';

describe('Submit Bid with HTTP User & Trust Stub (BID-03 / PR42)', () => {
  let receivedRequests: Array<{
    url: string;
    options?: RequestInit;
  }> = [];

  let orderResponseHandler: (url: string, options?: RequestInit) => Response | Promise<Response>;
  let userTrustResponseHandler: (url: string, options?: RequestInit) => Response | Promise<Response>;

  let prismaMock: any;
  let roundsServiceMock: any;
  let roundData: any;
  let bidsService: BidsService;

  function mockHttpResponse(status: number, data: unknown): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: vi.fn(async () => data),
    } as unknown as Response;
  }

  beforeEach(() => {
    receivedRequests = [];

    // Default Order Service handler: worker is eligible for service
    orderResponseHandler = () =>
      mockHttpResponse(200, {
        data: {
          eligible: true,
          serviceId: SERVICE_ID,
        },
      });

    // Default User & Trust handler: worker is verified and offers service
    userTrustResponseHandler = () =>
      mockHttpResponse(200, {
        data: {
          isVerified: true,
          serviceIds: [SERVICE_ID, 'other-service'],
        },
      });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        receivedRequests.push({ url: urlStr, options: init });

        if (urlStr.includes('/bidding-eligibility')) {
          return orderResponseHandler(urlStr, init);
        }
        if (urlStr.includes('/matching-profile')) {
          return userTrustResponseHandler(urlStr, init);
        }
        return mockHttpResponse(404, { message: 'Not found' });
      }),
    );

    const futureClosesAt = new Date(Date.now() + 600_000);
    const pastOpensAt = new Date(Date.now() - 600_000);

    roundData = {
      id: 'round-abc',
      serviceRequestId: SERVICE_REQUEST_ID,
      status: 'open',
      opensAt: pastOpensAt,
      closesAt: futureClosesAt,
      bidCount: 0,
    };

    prismaMock = {
      biddingRound: {
        findUnique: vi.fn(async () => ({ ...roundData })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({ ...roundData })),
      },
      bid: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({
          id: 'bid-xyz',
          ...data,
          submittedAt: new Date(),
        })),
      },
      outboxEvent: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }) => ({ id: 'evt-1', ...data })),
      },
      $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
        return callback(prismaMock);
      }),
    };

    roundsServiceMock = {
      expireRoundIfNeeded: vi.fn(),
      activateRoundIfNeeded: vi.fn(),
    };

    const config = {
      getUrl: vi.fn((key: string) => {
        if (key === 'ORDER_SERVICE_URL') return ORDER_SERVICE_URL;
        if (key === 'USER_TRUST_SERVICE_URL') return USER_TRUST_SERVICE_URL;
        throw new Error(`Unknown config key: ${key}`);
      }),
      internalServiceSecret: TEST_SECRET,
    } as unknown as ConfigService;

    const verifier = new RequestEligibilityVerifierService(config);

    bidsService = new BidsService(
      prismaMock,
      roundsServiceMock as unknown as RoundsService,
      undefined,
      verifier,
      config,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits bid successfully when User & Trust confirms worker is verified and offers service', async () => {
    const result = await bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, {
      amount: 150000,
      message: 'Sẵn sàng nhận việc',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('bid-xyz');
    expect(result.amount).toBe(150000);
    expect(result.status).toBe('active');

    // Verify User & Trust HTTP stub invocation details
    const expectedUserTrustUrl = `${USER_TRUST_SERVICE_URL}/api/v1/internal/v1/workers/${WORKER_ID}/matching-profile`;
    const userTrustReq = receivedRequests.find((r) => r.url === expectedUserTrustUrl);
    expect(userTrustReq).toBeDefined();
    expect(userTrustReq!.options?.method).toBe('GET');
    expect(userTrustReq!.options?.headers).toEqual({
      'x-internal-secret': TEST_SECRET,
    });
    expect(userTrustReq!.options?.signal).toBeInstanceOf(AbortSignal);

    // Verify DB writes
    expect(prismaMock.bid.create).toHaveBeenCalledOnce();
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledOnce();
  });

  it('rejects bid with ForbiddenException when User & Trust returns unverified worker (KYC pending)', async () => {
    userTrustResponseHandler = () =>
      mockHttpResponse(200, {
        data: {
          isVerified: false,
          serviceIds: [SERVICE_ID],
        },
      });

    await expect(
      bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, { amount: 150000 }),
    ).rejects.toThrow(
      new ForbiddenException('Thợ chưa hoàn tất xác thực danh tính (KYC) để gửi báo giá'),
    );

    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('rejects bid with ForbiddenException when worker does not offer the requested service', async () => {
    userTrustResponseHandler = () =>
      mockHttpResponse(200, {
        data: {
          isVerified: true,
          serviceIds: ['different-unrelated-service'],
        },
      });

    await expect(
      bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, { amount: 150000 }),
    ).rejects.toThrow(
      new ForbiddenException('Thợ chưa đăng ký ngành nghề dịch vụ phù hợp với yêu cầu này'),
    );

    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('rejects bid with ForbiddenException when worker profile is not found (HTTP 404)', async () => {
    userTrustResponseHandler = () =>
      mockHttpResponse(404, { message: 'Worker profile not found' });

    await expect(
      bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, { amount: 150000 }),
    ).rejects.toThrow(
      new ForbiddenException('Hồ sơ thợ không tồn tại hoặc đã bị khóa'),
    );

    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('fails closed (ServiceUnavailableException) when User & Trust returns 500 / 503', async () => {
    userTrustResponseHandler = () =>
      mockHttpResponse(503, { message: 'User & Trust overloaded' });

    await expect(
      bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, { amount: 150000 }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('fails closed (ServiceUnavailableException) on connection failure / ECONNREFUSED to User & Trust', async () => {
    userTrustResponseHandler = () => {
      throw Object.assign(new Error('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      });
    };

    await expect(
      bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, { amount: 150000 }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('fails closed (ServiceUnavailableException) on timeout to User & Trust', async () => {
    userTrustResponseHandler = () => {
      throw new DOMException('timeout', 'TimeoutError');
    };

    await expect(
      bidsService.submitBid(WORKER_ID, SERVICE_REQUEST_ID, { amount: 150000 }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });
});
