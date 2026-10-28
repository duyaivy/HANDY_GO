import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.AUTH_SERVICE_URL ??= 'http://localhost:3001';
  process.env.USER_TRUST_SERVICE_URL ??= 'http://localhost:3002';
  process.env.CATALOG_SERVICE_URL ??= 'http://localhost:3003';
  process.env.ORDER_SERVICE_URL ??= 'http://localhost:3004';
  process.env.BIDDING_SERVICE_URL ??= 'http://localhost:3005';
  process.env.MATCHING_SERVICE_URL ??= 'http://localhost:3006';
  process.env.PAYMENT_SERVICE_URL ??= 'http://localhost:3007';
  process.env.WALLET_SERVICE_URL ??= 'http://localhost:3008';
  process.env.TRACKING_SERVICE_URL ??= 'http://localhost:3009';
  process.env.NOTIFICATION_SERVICE_URL ??= 'http://localhost:3010';
  process.env.CLOUDINARY_CLOUD_NAME ??= 'mock_cloud';
  process.env.CLOUDINARY_API_KEY ??= 'mock_key';
  process.env.CLOUDINARY_API_SECRET ??= 'mock_secret';
});

import { Test, type TestingModule } from '@nestjs/testing';
import {
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { ApiGatewayModule } from '../src/api-gateway.module.js';
import { TokenVerifierService } from '@app/auth';
import { OrderClient } from '../src/candidates/clients/order.client.js';
import { BiddingClient } from '../src/candidates/clients/bidding.client.js';
import { MatchingClient } from '../src/candidates/clients/matching.client.js';

describe('Candidates Aggregation API Integration', () => {
  let app: INestApplication;
  let mockTokenVerifier: { verifyAccessToken: ReturnType<typeof vi.fn> };
  let mockOrderClient: { getServiceRequest: ReturnType<typeof vi.fn> };
  let mockBiddingClient: { getBidsAndStatus: ReturnType<typeof vi.fn> };
  let mockMatchingClient: { getRecommendations: ReturnType<typeof vi.fn> };

  const validRequestId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const customerUserId = 'c1234567-89ab-cdef-0123-456789abcdef';

  beforeAll(async () => {
    mockTokenVerifier = {
      verifyAccessToken: vi.fn(),
    };
    mockOrderClient = {
      getServiceRequest: vi.fn(),
    };
    mockBiddingClient = {
      getBidsAndStatus: vi.fn(),
    };
    mockMatchingClient = {
      getRecommendations: vi.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider(TokenVerifierService)
      .useValue(mockTokenVerifier)
      .overrideProvider(OrderClient)
      .useValue(mockOrderClient)
      .overrideProvider(BiddingClient)
      .useValue(mockBiddingClient)
      .overrideProvider(MatchingClient)
      .useValue(mockMatchingClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Requirement 16: Invalid Service Request UUID returns 400 Bad Request', async () => {
    mockTokenVerifier.verifyAccessToken.mockResolvedValue({
      userId: customerUserId,
      sub: 'acc-1',
      roles: ['Customer'],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/requests/invalid-uuid/candidates')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('Requirement 11 & Gateway Auth: Missing Bearer token returns 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/requests/${validRequestId}/candidates`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('Requirement 17 & 18: Gateway routing reaches aggregation controller for candidates', async () => {
    mockTokenVerifier.verifyAccessToken.mockResolvedValue({
      userId: customerUserId,
      sub: 'acc-1',
      roles: ['Customer'],
    });

    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: validRequestId,
      customerUserId,
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      closesAt: '2026-10-29T10:00:00.000Z',
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'bid-1',
          workerId: 'worker-1',
          amount: 300000,
          submittedAt: '2026-10-28T10:00:00.000Z',
          status: 'active',
          isMasked: false,
        },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        {
          matchResultId: 'match-1',
          workerUserId: 'worker-2',
          rank: 1,
          matchingScore: 92.5,
        },
      ],
      modelVersion: 'v1.0',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/requests/${validRequestId}/candidates?page=1&limit=20`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(200);
    expect(res.body.data.requestId).toBe(validRequestId);
    expect(res.body.data.requestStatus).toBe('open_for_bidding');
    expect(res.body.data.bidding.items).toHaveLength(1);
    expect(res.body.data.matching.recommendations).toHaveLength(1);
    expect(res.body.data.matching.displayLimit).toBe(5);
    expect(res.body.data.bidding.items[0].selectionSource).toBe('bid');
    expect(res.body.data.matching.recommendations[0].selectionSource).toBe(
      'recommendation',
    );
  });

  it('Denies access if customer is not the owner of the Service Request', async () => {
    mockTokenVerifier.verifyAccessToken.mockResolvedValue({
      userId: 'stranger-customer-id',
      sub: 'acc-stranger',
      roles: ['Customer'],
    });

    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: validRequestId,
      customerUserId: customerUserId, // different owner!
      status: 'open_for_bidding',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/requests/${validRequestId}/candidates`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
