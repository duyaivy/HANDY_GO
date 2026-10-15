import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { GatewayAuthMiddleware } from './gateway-auth.middleware.js';
import type { TokenVerifierService, JwtPayload } from '@app/auth';
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
  return {
    res: { status, headersSent: false } as unknown as Response,
    json,
    status,
  };
}

describe('GatewayAuthMiddleware (Unit)', () => {
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

  describe('public route', () => {
    it('bypasses verifier và inject internal headers cho public route', async () => {
      const req = buildReq({ originalUrl: '/api/v1/catalog', method: 'GET' });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(tokenVerifier.verifyAccessToken).not.toHaveBeenCalled();
      expect(req.headers['x-internal-secret']).toBe(
        'super-secret-internal-key',
      );
      expect(req.headers['x-forwarded-for']).toBe('127.0.0.1');
    });

    it('bỏ qua Authorization header dù token đã hết hạn đối với logout public route', async () => {
      const req = buildReq({
        originalUrl: '/api/v1/auth/logout',
        method: 'POST',
        headers: { authorization: 'Bearer expired.access.token' },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(tokenVerifier.verifyAccessToken).not.toHaveBeenCalled();
      expect(req.headers['x-internal-secret']).toBe(
        'super-secret-internal-key',
      );
      expect(req.headers['x-forwarded-for']).toBe('127.0.0.1');
    });
  });

  describe('authorization header', () => {
    it('trả 401 khi thiếu Authorization header', async () => {
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

    it('trả 401 khi invalid scheme (không phải Bearer <token>)', async () => {
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Basic credentials' },
      });
      const { res, status, json } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Mã truy cập không đúng định dạng Bearer <token>.',
        }),
      );
    });

    it('trả 401 khi tokenVerifier reject (token không hợp lệ hoặc đã hết hạn)', async () => {
      tokenVerifier.verifyAccessToken.mockRejectedValue(
        new Error('token expired'),
      );
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      const { res, status, json } = buildRes();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'token expired',
        }),
      );
    });

    it('trả 401 khi tokenVerifier reject Refresh Token', async () => {
      tokenVerifier.verifyAccessToken.mockRejectedValue(
        new UnauthorizedException(
          'Refresh token không được phép sử dụng làm mã truy cập',
        ),
      );
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer refresh.token' },
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
  });

  describe('authenticated request', () => {
    it('gọi verifier với Bearer token và inject identity headers', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue(mockPayload);
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(tokenVerifier.verifyAccessToken).toHaveBeenCalledWith(
        'valid.jwt.token',
      );
      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-id']).toBe('user-uuid');
      expect(req.headers['x-user-account-id']).toBe('account-uuid');
      expect(req.headers['x-user-roles']).toBe('Customer');
      expect(req.headers['x-user-permissions']).toBe('profile:read');
      expect(req.headers['x-internal-secret']).toBe(
        'super-secret-internal-key',
      );
      expect(req.headers['x-forwarded-for']).toBe('127.0.0.1');
    });

    it('ghi đè (overwrite) các header x-user-* giả mạo từ client', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue(mockPayload);
      const req = buildReq({
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'x-user-id': 'hacker-id',
          'x-user-account-id': 'hacker-acc',
          'x-user-roles': 'Admin',
          'x-user-permissions': 'all:super',
        },
      });
      const { res } = buildRes();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.headers['x-user-id']).toBe('user-uuid');
      expect(req.headers['x-user-account-id']).toBe('account-uuid');
      expect(req.headers['x-user-roles']).toBe('Customer');
      expect(req.headers['x-user-permissions']).toBe('profile:read');
    });
  });
});
