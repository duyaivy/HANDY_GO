import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { ConfigService } from '@app/config';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

describe('dashboard HTTP contract', () => {
  let app: INestApplication;
  const expectedData = {
    revenue: { total: 0, currency: 'VND' },
    orders: { total: 0 },
    workers: { activeInPeriod: 0 },
    customers: { totalCumulative: 0 },
  };
  const overview = vi.fn().mockResolvedValue(expectedData);
  const trendData = {
    granularity: 'day',
    timeline: [{ bucket: '2026-11-15', orderCount: 0 }],
  };
  const orderTrend = vi.fn().mockResolvedValue(trendData);
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        TrustedGatewayGuard,
        AdminGuard,
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'shared-secret' },
        },
        { provide: DashboardService, useValue: { overview, orderTrend } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => app?.close());

  it('rejects calls without gateway secret or Admin role', async () => {
    await supertest(app.getHttpServer())
      .get('/api/v1/admin/dashboard/overview')
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMIN')
      .expect(403);
    await supertest(app.getHttpServer())
      .get('/api/v1/admin/dashboard/overview')
      .set('x-internal-secret', 'shared-secret')
      .set('x-user-id', userId)
      .set('x-user-roles', 'CUSTOMER')
      .expect(403);
  });

  it('returns the envelope for an Admin and rejects malformed custom dates', async () => {
    const request = () =>
      supertest(app.getHttpServer())
        .get('/api/v1/admin/dashboard/overview')
        .set('x-internal-secret', 'shared-secret')
        .set('x-user-id', userId)
        .set('x-user-roles', 'ADMIN');
    const response = await request().expect(200);
    expect(response.body.statusCode).toBe(200);
    expect(response.body.message).toBe('Thao tác thành công');
    expect(response.body.data).toEqual(expectedData);
    await request()
      .query({
        period: 'custom',
        startDate: '2026-02-30',
        endDate: '2026-03-01',
      })
      .expect(400);
  });

  it('protects order-trend and applies the shared query validation', async () => {
    const path = '/api/v1/admin/dashboard/order-trend';
    await supertest(app.getHttpServer())
      .get(path)
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMIN')
      .expect(403);
    await supertest(app.getHttpServer())
      .get(path)
      .set('x-internal-secret', 'shared-secret')
      .set('x-user-id', userId)
      .set('x-user-roles', 'CUSTOMER')
      .expect(403);

    const admin = () =>
      supertest(app.getHttpServer())
        .get(path)
        .set('x-internal-secret', 'shared-secret')
        .set('x-user-id', userId)
        .set('x-user-roles', 'ADMIN');
    const response = await admin().query({ period: '7days' }).expect(200);
    expect(response.body.data).toEqual(trendData);
    expect(orderTrend.mock.calls.at(-1)?.[1]).toBe('day');
    await admin()
      .query({
        period: 'custom',
        startDate: '2025-01-01',
        endDate: '2026-11-15',
      })
      .expect(400);
    await admin()
      .query({
        period: 'custom',
        startDate: '2026-02-30',
        endDate: '2026-03-01',
      })
      .expect(400);
  });
});
