import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigService } from '@app/config';
import { BidsController } from '../../../bidding-service/src/bids/bids.controller.js';
import { BidsService } from '../../../bidding-service/src/bids/bids.service.js';
import { InternalOrderController } from './internal-order.controller.js';
import { InternalOrderService } from './internal-order.service.js';
import { InternalSecretGuard } from './guards/internal-secret.guard.js';
import { ChatSessionController } from '../../../auth-service/src/internal/chat-session.controller.js';
import { SessionService } from '../../../auth-service/src/common/session/session.service.js';
import { ChatMediaController } from '../../../api-gateway/src/uploads/chat-media.controller.js';
import { CloudinaryService } from '@app/cloudinary';
const id = '11111111-1111-4111-8111-111111111111';
const routes = [
  ['get', `/api/v1/internal/bids/${id}/chat-eligibility`, undefined],
  [
    'get',
    `/api/v1/internal/bids/chat-lookup?requestId=${id}&workerId=${id}`,
    undefined,
  ],
  ['get', `/api/v1/internal/service-requests/${id}/chat-state`, undefined],
  [
    'post',
    '/api/v1/internal/auth/chat-session',
    { accountId: id, userId: id, sid: id },
  ],
  [
    'post',
    '/api/v1/internal/media/chat/verify',
    { storageKey: 'chat/a', ownerId: id, mediaType: 'IMAGE' },
  ],
] as const;
describe('service-only chat HTTP contracts', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [
        BidsController,
        InternalOrderController,
        ChatSessionController,
        ChatMediaController,
      ],
      providers: [
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'unit-secret' },
        },
        InternalSecretGuard,
        {
          provide: BidsService,
          useValue: {
            getChatEligibility: vi.fn().mockResolvedValue({ bidId: id }),
            lookupChatBid: vi.fn().mockResolvedValue({ bidId: id }),
          },
        },
        {
          provide: InternalOrderService,
          useValue: {
            getChatState: vi.fn().mockResolvedValue({ requestId: id }),
          },
        },
        {
          provide: SessionService,
          useValue: {
            inspectChatSession: vi.fn().mockResolvedValue({ active: true }),
          },
        },
        {
          provide: CloudinaryService,
          useValue: {
            verifyChatMedia: vi.fn().mockResolvedValue({ verified: true }),
          },
        },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,

        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  it.each(routes)(
    'refuses unauthenticated %s %s',
    async (method, path, body) => {
      const response = await request(app.getHttpServer())
        [method](path)
        .send(body);
      expect([401, 403]).toContain(response.status);
    },
  );
  it.each(routes)(
    'uses existing success envelope for %s %s',
    async (method, path, body) => {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('x-internal-secret', 'unit-secret')
        .send(body);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        statusCode: 200,
        data: expect.any(Object),
      });
    },
  );
  it('rejects forged additional identity fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/internal/auth/chat-session')
      .set('x-internal-secret', 'unit-secret')
      .send({ accountId: id, userId: id, sid: id, senderId: id });
    expect(response.status).toBe(400);
  });
  it('rejects additional private-media fields under shared bootstrap whitelist behavior', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/internal/media/chat/verify')
      .set('x-internal-secret', 'unit-secret')
      .send({
        storageKey: 'chat/a',
        ownerId: id,
        mediaType: 'IMAGE',
        url: 'https://evil.example',
      });
    expect(response.status).toBe(400);
  });
  it('rejects additional lookup query fields', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/internal/bids/chat-lookup?requestId=${id}&workerId=${id}&hasBid=true`,
      )
      .set('x-internal-secret', 'unit-secret');
    expect(response.status).toBe(400);
  });
});
