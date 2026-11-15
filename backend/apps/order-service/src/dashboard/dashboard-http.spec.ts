import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { ConfigService } from '@app/config';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

describe('dashboard overview HTTP contract', () => {
  let app: INestApplication;
  const expectedData = {
    revenue: { total: 0, currency: 'VND' },
    orders: { total: 0 },
    workers: { activeInPeriod: 0 },
    customers: { totalCumulative: 0 },
  };
  const overview = vi.fn().mockResolvedValue(expectedData);
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
        { provide: DashboardService, useValue: { overview } },
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
});
