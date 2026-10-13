import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { GatewayAuthMiddleware } from './gateway-auth.middleware.js';
import {
  AuthModule,
  AuthSignerModule,
  TokenVerifierService,
  TokenSignerService,
  type JwtPayload,
} from '@app/auth';
import type { ConfigService } from '@app/config';

const mockPayload: JwtPayload = {
  sub: 'account-uuid',
  userId: 'user-uuid',
  sid: 'session-uuid',
  roles: ['Customer'],
  permissions: ['profile:read'],
  iss: 'handy-go-auth',
  aud: 'handy-go',
  jti: 'token-uuid',
};

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

describe('GatewayAuthMiddleware', () => {
  let middleware: GatewayAuthMiddleware;
  let tokenVerifier: { verifyAccessToken: ReturnType<typeof vi.fn> };
  let configService: { internalServiceSecret: string };
  let next: NextFunction;

  beforeEach(() => {
    tokenVerifier = { verifyAccessToken: vi.fn() };
    configService = { internalServiceSecret: 'super-secret-internal-key' };
    middleware = new GatewayAuthMiddleware(
      tokenVerifier as unknown as TokenVerifierService,
      configService as unknown as ConfigService,
    );
    next = vi.fn();
  });

  describe('Public routes — bypass xác thực', () => {
    const publicCases = [
      { url: '/api/v1/auth/login', method: 'POST' },
      { url: '/api/v1/auth/register', method: 'POST' },
      { url: '/api/v1/auth/verify-email', method: 'POST' },
      { url: '/api/v1/auth/resend-otp', method: 'POST' },
      { url: '/api/v1/auth/refresh', method: 'POST' },
      { url: '/api/v1/catalog', method: 'GET' },
      { url: '/api/v1/catalog/123', method: 'GET' },
      { url: '/api/v1/categories', method: 'GET' },
      { url: '/health', method: 'GET' },
      { url: '/docs', method: 'GET' },
      { url: '/docs-json', method: 'GET' },
    ];

    it.each(publicCases)(
      '$method $url không yêu cầu xác thực JWT',
      async ({ url, method }) => {
        const req = buildReq({ originalUrl: url, method });
        const { res } = buildRes();

        await middleware.use(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(tokenVerifier.verifyAccessToken).not.toHaveBeenCalled();
      },
    );

    it('GET /api/v1/catalog cần inject x-internal-secret', async () => {
      const req = buildReq({ originalUrl: '/api/v1/catalog', method: 'GET' });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(req.headers['x-internal-secret']).toBe(
        'super-secret-internal-key',
      );
    });
  });

  describe('Catalog/Categories — chỉ GET là public, các method khác cần JWT', () => {
    it('POST /api/v1/catalog yêu cầu xác thực', async () => {
      const req = buildReq({ originalUrl: '/api/v1/catalog', method: 'POST' });
      const { res, status } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });

    it('DELETE /api/v1/categories/1 yêu cầu xác thực', async () => {
      const req = buildReq({
        originalUrl: '/api/v1/categories/1',
        method: 'DELETE',
      });
      const { res, status } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });
  });

  describe('Protected routes — yêu cầu JWT hợp lệ', () => {
    it('trả 401 khi không có Authorization header', async () => {
      const req = buildReq({ originalUrl: '/api/v1/orders', method: 'GET' });
      const { res, status, json } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Thiếu mã truy cập. Vui lòng đăng nhập.',
          data: expect.objectContaining({
            path: '/api/v1/orders',
            requestId: expect.any(String),
          }),
        }),
      );
    });

    it('trả 401 khi format sai (không phải Bearer)', async () => {
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Basic sometoken' },
      });
      const { res, status } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });

    it('trả 401 khi token không hợp lệ', async () => {
      tokenVerifier.verifyAccessToken.mockRejectedValue(
        new Error('token expired'),
      );
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      const { res, status } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });

    it('inject đúng identity headers và gọi next() khi token hợp lệ', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue(mockPayload);
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-id']).toBe('user-uuid');
      expect(req.headers['x-user-account-id']).toBe('account-uuid');
      expect(req.headers['x-user-roles']).toBe('Customer');
      expect(req.headers['x-user-permissions']).toBe('profile:read');
      expect(req.headers['x-internal-secret']).toBe(
        'super-secret-internal-key',
      );
    });

    it('strip x-user-* headers do client inject (chống spoofing)', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue(mockPayload);
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'x-user-id': 'hacker-id',
          'x-user-roles': 'Admin',
        },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      // Phải bị ghi đè bằng payload từ JWT, không phải giá trị client gửi lên
      expect(req.headers['x-user-id']).toBe('user-uuid');
      expect(req.headers['x-user-roles']).toBe('Customer');
    });

    it('Gateway từ chối Refresh Token khi gọi route bảo vệ (ví dụ: /api/v1/orders), dù Refresh Token còn hạn hay đã thu hồi', async () => {
      tokenVerifier.verifyAccessToken.mockRejectedValue(
        new UnauthorizedException(
          'Refresh token không được phép sử dụng làm mã truy cập',
        ),
      );
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer refresh.token.with.refresh.type' },
      });
      const { res, status, json } = buildRes();

      await middleware.use(req, res, next);

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

    it('Gateway từ chối Refresh Token khi gọi route upload hình ảnh (/api/v1/uploads/image)', async () => {
      tokenVerifier.verifyAccessToken.mockRejectedValue(
        new UnauthorizedException(
          'Refresh token không được phép sử dụng làm mã truy cập',
        ),
      );
      const req = buildReq({
        originalUrl: '/api/v1/uploads/image',
        method: 'POST',
        headers: { authorization: 'Bearer refresh.token.active.or.revoked' },
      });
      const { res, status, json } = buildRes();

      await middleware.use(req, res, next);

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

    it('Gateway từ chối Refresh Token khi gọi route khởi tạo video upload (/api/v1/uploads/video/init)', async () => {
      tokenVerifier.verifyAccessToken.mockRejectedValue(
        new UnauthorizedException(
          'Refresh token không được phép sử dụng làm mã truy cập',
        ),
      );
      const req = buildReq({
        originalUrl: '/api/v1/uploads/video/init',
        method: 'POST',
        headers: { authorization: 'Bearer refresh.token.active.or.revoked' },
      });
      const { res, status, json } = buildRes();

      await middleware.use(req, res, next);

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

    it('Gateway chấp nhận Access Token mới có tokenType: access', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue({
        ...mockPayload,
        tokenType: 'access',
      });
      const req = buildReq({
        originalUrl: '/api/v1/uploads/image',
        method: 'POST',
        headers: { authorization: 'Bearer new.access.token' },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-id']).toBe('user-uuid');
    });

    it('Gateway chấp nhận Access Token cũ không có tokenType trong giai đoạn chuyển tiếp', async () => {
      const legacyPayload: JwtPayload = {
        ...mockPayload,
        tokenType: undefined,
      };
      tokenVerifier.verifyAccessToken.mockResolvedValue(legacyPayload);
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer legacy.access.token' },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-id']).toBe('user-uuid');
    });
  });

  describe('Integration: GatewayAuthMiddleware với TokenVerifierService & TokenSignerService thật', () => {
    let realVerifier: TokenVerifierService;
    let realSigner: TokenSignerService;
    let realMiddleware: GatewayAuthMiddleware;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [AuthModule, AuthSignerModule],
      }).compile();

      realVerifier = module.get<TokenVerifierService>(TokenVerifierService);
      realSigner = module.get<TokenSignerService>(TokenSignerService);
      realMiddleware = new GatewayAuthMiddleware(
        realVerifier,
        configService as unknown as ConfigService,
      );
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
});

