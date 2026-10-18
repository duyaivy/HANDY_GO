import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Test, type TestingModule } from '@nestjs/testing';
import { GatewayAuthMiddleware } from '../src/auth/gateway-auth.middleware.js';
import {
  AuthModule,
  AuthSignerModule,
  TokenVerifierService,
  TokenSignerService,
} from '@app/auth';
import type { ConfigService } from '@app/config';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    headers: {},
    originalUrl: '/api/v1/orders',
    url: '/api/v1/orders',
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function buildRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, headersSent: false } as unknown as Response;
  return { res, json, status };
}

describe('GatewayAuthMiddleware Integration (Real RS256 Tokens)', () => {
  let module: TestingModule;
  let realVerifier: TokenVerifierService;
  let realSigner: TokenSignerService;
  let realMiddleware: GatewayAuthMiddleware;
  let configService: { internalServiceSecret: string };
  let next: NextFunction;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
    }).compile();

    configService = { internalServiceSecret: 'super-secret-internal-key' };
    realVerifier = module.get<TokenVerifierService>(TokenVerifierService);
    realSigner = module.get<TokenSignerService>(TokenSignerService);
    realMiddleware = new GatewayAuthMiddleware(
      realVerifier,
      configService as unknown as ConfigService,
    );
  });

  beforeEach(() => {
    next = vi.fn();
  });

  afterAll(async () => {
    await module.close();
  });

  it('Gateway từ chối Refresh Token thật (RS256 hợp lệ) khi gọi route upload /api/v1/uploads/image', async () => {
    const refreshToken = await realSigner.signRefreshToken({
      accountId: 'acc-real-1',
      userId: 'user-real-1',
      sessionId: 'sess-real-1',
    });

    const req = buildReq({
      originalUrl: '/api/v1/uploads/image',
      method: 'POST',
      headers: { authorization: `Bearer ${refreshToken}` },
    });
    const { res, status, json } = buildRes();

    await realMiddleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Refresh token không được phép sử dụng làm mã truy cập',
      }),
    );
  });

  it('Gateway chấp nhận Access Token thật có tokenType: access khi gọi route upload', async () => {
    const { token: accessToken } = await realSigner.signAccessToken({
      accountId: 'acc-real-2',
      userId: 'user-real-2',
      sessionId: 'sess-real-2',
      roles: ['Customer'],
      permissions: ['profile:read'],
    });

    const req = buildReq({
      originalUrl: '/api/v1/uploads/image',
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const { res } = buildRes();

    await realMiddleware.use(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.headers['x-user-id']).toBe('user-real-2');
    expect(req.headers['x-user-account-id']).toBe('acc-real-2');
  });
});
