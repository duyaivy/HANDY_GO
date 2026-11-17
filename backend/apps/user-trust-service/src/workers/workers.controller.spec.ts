import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { WorkersController } from './workers.controller.js';
import { WorkersService } from './workers.service.js';
import { InternalServiceGuard } from '../common/guards/internal-service.guard.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

describe('Worker summaries HTTP contract', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const rankDashboardWorkers = vi.fn().mockResolvedValue([]);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkersController],
      providers: [
        InternalServiceGuard,
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'test-secret' },
        },
        {
          provide: WorkersService,
          useValue: {
            rankDashboardWorkers,
            getSummaries: vi
              .fn()
              .mockResolvedValue([{ workerId: id, fullName: 'Nguyễn Văn An' }]),
            getDashboardSummaries: vi.fn().mockResolvedValue([
              {
                workerUserId: id,
                fullName: 'Nguyễn Văn An',
                avatarUrl: null,
                averageRating: 4.8,
              },
            ]),
          },
        },
      ],
    }).compile();
    const expressApp = module.createNestApplication<NestExpressApplication>();
    expressApp.useBodyParser('json', { limit: '16mb' });
    app = expressApp;
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('requires the internal secret', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/internal/workers/batch-summary?ids=${id}`)
      .expect(403);
  });
  it('validates IDs and batch size', async () => {
    for (const ids of ['not-a-uuid', Array(101).fill(id).join(',')]) {
      await request(app.getHttpServer())
        .get(`/api/v1/internal/workers/batch-summary?ids=${ids}`)
        .set('x-internal-secret', 'test-secret')
        .expect(400);
    }
  });
  it('returns a summary envelope for valid internal calls', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/internal/workers/batch-summary?ids=${id}`)
      .set('x-internal-secret', 'test-secret')
      .expect(200)
      .expect((res) => {
        if (res.body.data[0].fullName !== 'Nguyễn Văn An')
          throw new Error('Missing worker name');
      });
  });
  it('protects and validates the dashboard summary route', async () => {
    const path = `/api/v1/internal/workers/dashboard-summaries?ids=${id}`;
    await request(app.getHttpServer()).get(path).expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/internal/workers/dashboard-summaries?ids=invalid')
      .set('x-internal-secret', 'test-secret')
      .expect(400);
    await request(app.getHttpServer())
      .get(path)
      .set('x-internal-secret', 'test-secret')
      .expect(200)
      .expect((res) => {
        if (res.body.data[0].averageRating !== 4.8)
          throw new Error('Missing current rating');
      });
  });

  it('protects ranking and validates nested candidate IDs and counts', async () => {
    const path = '/api/v1/internal/workers/dashboard-ranking';
    await request(app.getHttpServer())
      .post(path)
      .send({ candidates: [] })
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('x-internal-secret', 'wrong')
      .send({ candidates: [] })
      .expect(403);
    for (const candidates of [
      [],
      null,
      [{ workerUserId: 'invalid', completedOrderCount: 1 }],
      [{ workerUserId: id, completedOrderCount: 0 }],
      [{ workerUserId: id, completedOrderCount: 1.5 }],
      [{ workerUserId: id, completedOrderCount: '1' }],
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .set('x-internal-secret', 'test-secret')
        .send({ candidates })
        .expect(400);
    }
    const candidates = [{ workerUserId: id, completedOrderCount: 3 }];
    await request(app.getHttpServer())
      .post(path)
      .set('x-internal-secret', 'test-secret')
      .send({ candidates })
      .expect(200);
    expect(rankDashboardWorkers).toHaveBeenCalledWith(candidates);
  });

  it('accepts a tied candidate set larger than the default JSON body limit', async () => {
    const candidates = Array.from({ length: 10_000 }, (_, i) => ({
      workerUserId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      completedOrderCount: 1,
    }));
    await request(app.getHttpServer())
      .post('/api/v1/internal/workers/dashboard-ranking')
      .set('x-internal-secret', 'test-secret')
      .send({ candidates })
      .expect(200);
    expect(rankDashboardWorkers.mock.calls.at(-1)?.[0]).toHaveLength(10_000);
  });
});
