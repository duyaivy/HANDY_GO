import { Test } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import { JwtAuthGuard, PermissionsGuard } from '@app/auth';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { UserTrustServiceController } from '../../user-trust-service.controller.js';
import { UserTrustServiceService } from '../../user-trust-service.service.js';
import { InternalServiceGuard } from './internal-service.guard.js';

describe('User Trust matching endpoint authentication over HTTP', () => {
  let app: INestApplication;
  const service = {
    findWorkerCandidates: vi.fn().mockResolvedValue([]),
    getWorkerMatchProfile: vi.fn().mockResolvedValue(null),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserTrustServiceController],
      providers: [
        InternalServiceGuard,
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'endpoint-test-secret' },
        },
        { provide: UserTrustServiceService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each([
    '/internal/v1/workers/candidates',
    '/internal/v1/workers/00000000-0000-4000-8000-000000000001/matching-profile',
  ])('rejects direct requests without valid secret: %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set('x-internal-secret', 'invalid')
      .expect(403);
    expect(service.findWorkerCandidates).not.toHaveBeenCalled();
    expect(service.getWorkerMatchProfile).not.toHaveBeenCalled();
  });
  it('allows an authenticated internal request', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/workers/candidates')
      .set('x-internal-secret', 'endpoint-test-secret')
      .expect(200, []);
  });
});
