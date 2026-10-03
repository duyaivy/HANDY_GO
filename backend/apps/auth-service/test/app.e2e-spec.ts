import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';

process.env.OTP_SECRET = 'test-otp-secret-key-for-e2e-testing-only-12345';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-key-12345';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthSeedService } from '../src/common/seed/auth-seed.service.js';
import { OutboxPublisherService } from '@app/common';
import { AuthServiceModule } from './../src/auth-service.module.js';

describe('AuthServiceController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthServiceModule],
    })
      .overrideProvider(AuthSeedService)
      .useValue({
        seed: vi.fn().mockResolvedValue(undefined),
        onModuleInit: vi.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(OutboxPublisherService)
      .useValue({
        triggerPublish: vi.fn().mockResolvedValue(undefined),
        publishPendingEvents: vi.fn().mockResolvedValue(0),
        onModuleInit: vi.fn(),
        onModuleDestroy: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) should be accessible publicly without token', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('auth-service');
      });
  });

  it('/auth/me (GET) should reject request with 401 when token is missing', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });

  it('/ (GET) should return 404', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(404);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
