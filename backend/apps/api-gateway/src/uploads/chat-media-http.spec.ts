import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  Module,
  type INestApplication,
  type NestModule,
  type MiddlewareConsumer,
} from '@nestjs/common';
import request from 'supertest';
import { ConfigService } from '@app/config';
import { TokenVerifierService } from '@app/auth';
import { CloudinaryService } from '@app/cloudinary';
import { ApiGatewayModule } from '../api-gateway.module.js';
import { GatewayAuthMiddleware } from '../auth/gateway-auth.middleware.js';
import { ProxyMiddleware } from '../proxy/index.js';
import { RateLimitMiddleware } from '../rate-limit/index.js';
import { ChatMediaController } from './chat-media.controller.js';
import { FallbackController } from '../fallback/index.js';
const verifier = {
  verifyAccessToken: vi.fn().mockRejectedValue(new Error('no JWT')),
};
const media = {
  verifyChatMedia: vi.fn().mockResolvedValue({ verified: true }),
};
const pass = {
  use: (_req: unknown, _res: unknown, next: () => void) => next(),
};
@Module({
  controllers: [ChatMediaController],
  providers: [
    { provide: CloudinaryService, useValue: media },
    { provide: ConfigService, useValue: { internalServiceSecret: 'unit-secret' } },
  ],
})
class ImportedMediaModule {}
@Module({
  imports: [ImportedMediaModule],
  controllers: Reflect.getMetadata('controllers', ApiGatewayModule).filter(
    (controller: unknown) =>
      controller === ChatMediaController || controller === FallbackController,
  ),
  providers: [
    GatewayAuthMiddleware,
    {
      provide: ConfigService,
      useValue: {
        internalServiceSecret: 'unit-secret',
        getUrl: () => 'http://127.0.0.1:1',
        get: () => undefined,
        upstreamTimeoutMs: 100,
      },
    },
    { provide: TokenVerifierService, useValue: verifier },
    { provide: CloudinaryService, useValue: media },
    { provide: ProxyMiddleware, useValue: pass },
    { provide: RateLimitMiddleware, useValue: pass },
  ],
})
class GatewayMediaTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    ApiGatewayModule.prototype.configure.call(this, consumer);
  }
}
describe('actual Gateway middleware registration for internal chat media', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [GatewayMediaTestModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => app?.close());
  it('preserves service credential only for exact internal POST and authenticates it in handler', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/internal/media/chat/verify')
      .set('x-internal-secret', 'unit-secret')
      .send({
        storageKey: 'chat/a',
        ownerId: '11111111-1111-4111-8111-111111111111',
        mediaType: 'IMAGE',
      });
    expect(response.status).toBe(200);
    expect(response.body.data.verified).toBe(true);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });
  it('rejects the service route without its credential', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/internal/media/chat/verify')
      .send({});
    expect(response.status).toBe(401);
  });
  it('still requires JWT for adjacent public-client paths', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/internal/media/chat/verify')
      .set('x-internal-secret', 'unit-secret');
    expect(response.status).toBe(401);
  });
});
