import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { beforeAll, afterAll, describe, it, vi } from 'vitest';
import request from 'supertest';
import { WorkersController } from './workers.controller.js';
import { WorkersService } from './workers.service.js';
import { InternalServiceGuard } from '../common/guards/internal-service.guard.js';

describe('Worker summaries HTTP contract', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
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
            getSummaries: vi
              .fn()
              .mockResolvedValue([{ workerId: id, fullName: 'Nguyễn Văn An' }]),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
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
});
