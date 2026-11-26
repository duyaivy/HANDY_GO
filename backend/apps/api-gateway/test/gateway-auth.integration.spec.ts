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
import { ForbiddenException } from '@nestjs/common';
import { GatewayAuthMiddleware } from '../src/auth/gateway-auth.middleware.js';
import { AdminRoleGuard } from '../src/auth/admin-role.guard.js';
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

  describe('Forged identity headers and role-based protection (P1/P2 review)', () => {
    const adminGuard = new AdminRoleGuard();

    function mockExecutionContext(req: Request): any {
      return {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => ({}),
        }),
      };
    }

    it('rejects anonymous request to /health/ai with forged x-user-roles: Admin (401 Unauthorized)', async () => {
      const req = buildReq({
        originalUrl: '/health/ai',
        method: 'GET',
        headers: {
          'x-user-roles': 'Admin',
          'x-user-id': 'attacker-uuid',
          'x-internal-secret': 'fake-secret',
        },
      });
      const { res, status, json } = buildRes();

      await realMiddleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        }),
      );
      // Forged headers must be stripped
      expect(req.headers['x-user-roles']).toBeUndefined();
      expect(req.headers['x-user-id']).toBeUndefined();
    });

    it('strips forged x-user-roles: Admin from valid Customer token and rejects at AdminRoleGuard (403 Forbidden)', async () => {
      const { token: customerToken } = await realSigner.signAccessToken({
        accountId: 'acc-cust-1',
        userId: 'user-cust-1',
        sessionId: 'sess-cust-1',
        roles: ['Customer'],
        permissions: ['profile:read'],
      });

      const req = buildReq({
        originalUrl: '/health/ai',
        method: 'GET',
        headers: {
          authorization: `Bearer ${customerToken}`,
          'x-user-roles': 'Admin', // Forged role header from client
          'x-user-id': 'spoofed-admin-id',
        },
      });
      const { res } = buildRes();

      await realMiddleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      // Forged header is overwritten with real JWT role
      expect(req.headers['x-user-roles']).toBe('Customer');
      expect(req.headers['x-user-id']).toBe('user-cust-1');
      expect((req as any).user.roles).toEqual(['Customer']);

      // AdminRoleGuard must reject Customer access with 403 Forbidden
      expect(() => adminGuard.canActivate(mockExecutionContext(req))).toThrow(ForbiddenException);
    });

    it('rejects Worker token at AdminRoleGuard (403 Forbidden)', async () => {
      const { token: workerToken } = await realSigner.signAccessToken({
        accountId: 'acc-worker-1',
        userId: 'user-worker-1',
        sessionId: 'sess-worker-1',
        roles: ['Worker'],
        permissions: ['jobs:read'],
      });

      const req = buildReq({
        originalUrl: '/health/ai',
        method: 'GET',
        headers: {
          authorization: `Bearer ${workerToken}`,
        },
      });
      const { res } = buildRes();

      await realMiddleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-roles']).toBe('Worker');
      expect(() => adminGuard.canActivate(mockExecutionContext(req))).toThrow(ForbiddenException);
    });

    it('allows valid Admin token at AdminRoleGuard (200 OK)', async () => {
      const { token: adminToken } = await realSigner.signAccessToken({
        accountId: 'acc-admin-1',
        userId: 'user-admin-1',
        sessionId: 'sess-admin-1',
        roles: ['Admin'],
        permissions: ['system:all'],
      });

      const req = buildReq({
        originalUrl: '/health/ai',
        method: 'GET',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      const { res } = buildRes();

      await realMiddleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-roles']).toBe('Admin');
      expect(adminGuard.canActivate(mockExecutionContext(req))).toBe(true);
    });

    it('allows exact GET /health publicly and strips forged identity headers', async () => {
      const req = buildReq({
        originalUrl: '/health',
        method: 'GET',
        headers: {
          'x-user-roles': 'Admin',
          'x-user-id': 'forged-user',
        },
      });
      const { res } = buildRes();

      await realMiddleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-roles']).toBeUndefined();
      expect(req.headers['x-user-id']).toBeUndefined();
      expect(req.headers['x-internal-secret']).toBe('super-secret-internal-key');
    });
  });
});
