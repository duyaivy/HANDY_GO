import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  Module,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const keyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

vi.hoisted(() => {
  process.env.AUTH_SERVICE_URL ??= 'http://127.0.0.1:3001';
  process.env.USER_TRUST_SERVICE_URL ??= 'http://127.0.0.1:3002';
  process.env.AI_SERVICE_URL ??= 'http://127.0.0.1:8000';
  process.env.CATALOG_SERVICE_URL ??= 'http://127.0.0.1:3003';
  process.env.ORDER_SERVICE_URL ??= 'http://127.0.0.1:3004';
  process.env.BIDDING_SERVICE_URL ??= 'http://127.0.0.1:3005';
  process.env.MATCHING_SERVICE_URL ??= 'http://127.0.0.1:3006';
  process.env.PAYMENT_SERVICE_URL ??= 'http://127.0.0.1:3007';
  process.env.WALLET_SERVICE_URL ??= 'http://127.0.0.1:3008';
  process.env.TRACKING_SERVICE_URL ??= 'http://127.0.0.1:3009';
  process.env.NOTIFICATION_SERVICE_URL ??= 'http://127.0.0.1:3010';
  process.env.CLOUDINARY_CLOUD_NAME ??= 'mock_cloud';
  process.env.CLOUDINARY_API_KEY ??= 'mock_key';
  process.env.CLOUDINARY_API_SECRET ??= 'mock_secret';
});

import {
  AuthModule,
  AuthSignerModule,
  JwtAuthGuard,
  PermissionsGuard,
  Role,
  StandardPermissions,
  TokenSignerService,
} from '@app/auth';
import { ConfigService } from '@app/config';
import { UserTrustPrismaService } from '@app/database';
import { GatewayAuthMiddleware } from './auth/gateway-auth.middleware.js';
import { ProxyMiddleware } from './proxy/index.js';
import { RateLimitMiddleware } from './rate-limit/index.js';
import { UserTrustServiceController } from '../../user-trust-service/src/user-trust-service.controller.js';
import { UserTrustServiceService } from '../../user-trust-service/src/user-trust-service.service.js';
import { AuthClient } from '../../user-trust-service/src/clients/auth.client.js';

const TARGET_WORKER_PROFILE_ID = '00000000-0000-4000-8000-000000000011';
const TARGET_WORKER_USER_ID = '00000000-0000-4000-8000-000000000012';
const CALLER_WORKER_USER_ID = '00000000-0000-4000-8000-000000000022';
const CALLER_CUSTOMER_USER_ID = '00000000-0000-4000-8000-000000000033';
const CALLER_ADMIN_USER_ID = '00000000-0000-4000-8000-000000000044';
const RAW_PHONE = '+84912345678';

describe('API Gateway -> user-trust-service HTTP worker-profile masking by JWT role', () => {
  let userTrustApp: INestApplication;
  let gatewayApp: INestApplication;
  let gatewayOrigin: string;
  let customerToken: string;
  let workerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_PUBLIC_KEY = keyPair.publicKey;
    process.env.JWT_PRIVATE_KEY = keyPair.privateKey;
    expect(keyPair.publicKey).toContain('PUBLIC KEY');

    const dbMock = {
      workerProfile: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          const targetUserId =
            where?.userId === CALLER_WORKER_USER_ID
              ? CALLER_WORKER_USER_ID
              : TARGET_WORKER_USER_ID;
          return {
            id: TARGET_WORKER_PROFILE_ID,
            userId: targetUserId,
            status: 'verified',
            averageRating: 4.9,
            ratingCount: 10,
            completedOrderCount: 12,
            orderCountTotal: 12,
            verifiedAt: new Date('2026-10-01T00:00:00Z'),
            approvedAt: new Date('2026-10-01T00:00:00Z'),
            createdAt: new Date('2026-09-01T00:00:00Z'),
            user: {
              fullName: 'Trần Văn Thợ',
              avatarUrl: null,
              status: 'active',
              customerProfile: {
                bio: 'Thợ sửa điện nước 10 năm kinh nghiệm',
              },
            },
            serviceOfferings: [
              {
                id: 'off-1',
                serviceId: '00000000-0000-4000-8000-000000000099',
                title: 'Sửa điện dân dụng',
                description: 'Khắc phục chập điện nhanh chóng',
                experienceYears: 10,
                isActive: true,
              },
            ],
            serviceAreas: [],
          };
        }),
      },
      workerReview: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const authClientMock = {
      getUserPhone: vi.fn().mockResolvedValue(RAW_PHONE),
    };

    @Module({
      imports: [AuthModule],
      controllers: [UserTrustServiceController],
      providers: [
        UserTrustServiceService,
        { provide: UserTrustPrismaService, useValue: dbMock },
        { provide: AuthClient, useValue: authClientMock },
        {
          provide: ConfigService,
          useValue: {
            internalServiceSecret: 'unit-secret',
            upstreamTimeoutMs: 5000,
            get: () => undefined,
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    })
    class TestUserTrustHttpModule {}

    const userTrustMod = await Test.createTestingModule({
      imports: [TestUserTrustHttpModule],
    }).compile();

    userTrustApp = userTrustMod.createNestApplication();
    userTrustApp.setGlobalPrefix('api/v1');
    await userTrustApp.listen(0, '127.0.0.1');
    const userTrustPort = (userTrustApp.getHttpServer().address() as AddressInfo).port;
    const userTrustOrigin = `http://127.0.0.1:${userTrustPort}`;

    @Module({
      imports: [AuthModule, AuthSignerModule],
      providers: [
        GatewayAuthMiddleware,
        RateLimitMiddleware,
        ProxyMiddleware,
        {
          provide: ConfigService,
          useValue: {
            internalServiceSecret: 'unit-secret',
            upstreamTimeoutMs: 5000,
            get: () => undefined,
            getUrl: (key: string) =>
              key === 'USER_TRUST_SERVICE_URL'
                ? userTrustOrigin
                : 'http://127.0.0.1:1',
          },
        },
      ],
    })
    class TestGatewayHttpModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        consumer
          .apply(RateLimitMiddleware, GatewayAuthMiddleware, ProxyMiddleware)
          .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
      }
    }

    const gatewayMod = await Test.createTestingModule({
      imports: [TestGatewayHttpModule],
    }).compile();

    gatewayApp = gatewayMod.createNestApplication();
    gatewayApp.setGlobalPrefix('api/v1');
    await gatewayApp.listen(0, '127.0.0.1');
    const gatewayPort = (gatewayApp.getHttpServer().address() as AddressInfo).port;
    gatewayOrigin = `http://127.0.0.1:${gatewayPort}`;

    const signer = gatewayMod.get(TokenSignerService);
    customerToken = (
      await signer.signAccessToken({
        accountId: 'acc-cust',
        userId: CALLER_CUSTOMER_USER_ID,
        sessionId: 'sess-cust',
        roles: [Role.CUSTOMER],
        permissions: [StandardPermissions.PROFILE_READ],
      })
    ).token;
    workerToken = (
      await signer.signAccessToken({
        accountId: 'acc-worker',
        userId: CALLER_WORKER_USER_ID,
        sessionId: 'sess-worker',
        roles: [Role.WORKER],
        permissions: [StandardPermissions.PROFILE_READ],
      })
    ).token;
    adminToken = (
      await signer.signAccessToken({
        accountId: 'acc-admin',
        userId: CALLER_ADMIN_USER_ID,
        sessionId: 'sess-admin',
        roles: [Role.ADMIN],
        permissions: [StandardPermissions.PROFILE_READ],
      })
    ).token;
  });

  afterAll(async () => {
    await gatewayApp?.close();
    await userTrustApp?.close();
  });

  const routes = [
    `/api/v1/workers/${TARGET_WORKER_PROFILE_ID}`,
    `/api/v1/workers/${TARGET_WORKER_PROFILE_ID}/profile`,
    '/api/v1/workers/me/profile',
  ];

  it.each(routes)(
    'returns 401 when unauthenticated on %s',
    async (routePath) => {
      const res = await fetch(`${gatewayOrigin}${routePath}`);
      expect(res.status).toBe(401);
    },
  );

  it.each(routes)(
    'masks worker phone in JSON response for Customer JWT on %s',
    async (routePath) => {
      const res = await fetch(`${gatewayOrigin}${routePath}`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.phone).toBe('09***78');
      const rawJson = JSON.stringify(body);
      expect(rawJson).not.toContain(RAW_PHONE);
      expect(rawJson).not.toContain('912345678');
    },
  );

  it.each(routes)(
    'masks worker phone in JSON response for Worker JWT (viewing another worker or me) on %s',
    async (routePath) => {
      const res = await fetch(`${gatewayOrigin}${routePath}`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.phone).toBe('09***78');
      const rawJson = JSON.stringify(body);
      expect(rawJson).not.toContain(RAW_PHONE);
      expect(rawJson).not.toContain('912345678');
    },
  );

  it.each(routes)(
    'returns full unmasked worker phone in JSON response for Admin JWT on %s',
    async (routePath) => {
      const res = await fetch(`${gatewayOrigin}${routePath}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.phone).toBe(RAW_PHONE);
    },
  );
});
