import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { ConfigService } from '@app/config';
import { DashboardServicesController } from './dashboard-services.controller.js';
import { InternalServiceGuard } from './internal-service.guard.js';
import { ServicesService } from './services.service.js';

describe('Catalog dashboard summaries', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const findMany = vi
    .fn()
    .mockResolvedValue([{ id, name: 'Vệ sinh nhà cửa', iconUrl: null }]);
  const prisma = { service: { findMany } };
  const services = new ServicesService(
    prisma as never,
    {} as never,
    {} as never,
  );
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardServicesController],
      providers: [
        InternalServiceGuard,
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'test-secret' },
        },
        { provide: ServicesService, useValue: services },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('fetches inactive services by ID without isActive filtering', async () => {
    findMany.mockClear();
    expect(await services.getDashboardSummaries([id])).toEqual([
      { id, name: 'Vệ sinh nhà cửa', iconUrl: null },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: [id] } },
      select: { id: true, name: true, iconUrl: true },
    });
  });

  it('requires the internal secret and rejects invalid input', async () => {
    const path = `/api/v1/internal/services/dashboard-summaries?ids=${id}`;
    await supertest(app.getHttpServer()).get(path).expect(403);
    await supertest(app.getHttpServer())
      .get(path)
      .set('x-internal-secret', 'wrong-secret')
      .expect(403);
    for (const ids of ['invalid', Array(101).fill(id).join(',')]) {
      await supertest(app.getHttpServer())
        .get('/api/v1/internal/services/dashboard-summaries')
        .query({ ids })
        .set('x-internal-secret', 'test-secret')
        .expect(400);
    }
  });

  it('returns names and nullable icons through the secret-protected route', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/internal/services/dashboard-summaries')
      .query({ ids: id })
      .set('x-internal-secret', 'test-secret')
      .expect(200);
    expect(response.body.data).toEqual([
      { id, name: 'Vệ sinh nhà cửa', iconUrl: null },
    ]);
  });
});
