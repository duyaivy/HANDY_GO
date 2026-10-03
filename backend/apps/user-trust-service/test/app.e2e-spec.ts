import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserTrustServiceModule } from './../src/user-trust-service.module.js';

describe('UserTrustServiceController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UserTrustServiceModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) should be accessible publicly without token', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('user-trust-service');
      });
  });

  it('/users/me (GET) should reject request with 401 when token is missing', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .expect(401);
  });

  it('/ (GET) should return 404 as root welcome route was removed', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
