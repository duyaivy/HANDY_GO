import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { TokenVerifierService } from '@app/auth';
import { ConfigService } from '@app/config';
import crypto from 'node:crypto';
import { buildErrorResponse, ERROR_CODES } from '@app/common';

import { isPublicRoute } from './gateway-auth-route.policy.js';

function buildUnauthorizedResponse(
  res: Response,
  req: Request,
  message: string,
): void {
  const existingRequestId = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(existingRequestId)
      ? existingRequestId[0]
      : existingRequestId) || crypto.randomUUID();

  res.status(401).json(
    buildErrorResponse(401, ERROR_CODES.UNAUTHORIZED, message, {
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url,
      requestId,
    }),
  );
}

@Injectable()
export class GatewayAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly tokenVerifier: TokenVerifierService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const pathname = req.originalUrl || req.url;
    const method = req.method;

    // 1. Bỏ qua xác thực cho public routes
    if (isPublicRoute(pathname, method)) {
      this.injectGatewayHeaders(req);
      return next();
    }

    // 2. Kiểm tra Authorization header
    const authHeader = req.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      return buildUnauthorizedResponse(
        res,
        req,
        'Thiếu mã truy cập. Vui lòng đăng nhập.',
      );
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return buildUnauthorizedResponse(
        res,
        req,
        'Mã truy cập không đúng định dạng Bearer <token>.',
      );
    }

    // 3. Xác thực RS256 JWT Access Token
    let payload;
    try {
      payload = await this.tokenVerifier.verifyAccessToken(token);
    } catch (error: any) {
      return buildUnauthorizedResponse(
        res,
        req,
        error instanceof Error && error.message
          ? error.message
          : 'Mã truy cập không hợp lệ hoặc đã hết hạn.',
      );
    }

    // 4. Strip mọi header x-user-* do client cung cấp (chống injection)
    delete req.headers['x-user-id'];
    delete req.headers['x-user-account-id'];
    delete req.headers['x-user-roles'];
    delete req.headers['x-user-permissions'];

    // 5. Inject trusted identity headers để forward tới downstream services
    req.headers['x-user-id'] = payload.userId;
    req.headers['x-user-account-id'] = payload.sub;
    req.headers['x-user-roles'] = (payload.roles ?? []).join(',');
    req.headers['x-user-permissions'] = (payload.permissions ?? []).join(',');

    // 6. Inject internal gateway secret
    this.injectGatewayHeaders(req);

    return next();
  }

  private injectGatewayHeaders(req: Request): void {
    const internalSecret = this.config.internalServiceSecret;
    if (internalSecret) {
      req.headers['x-internal-secret'] = internalSecret;
    }

    // Inject x-forwarded-for từ socket (không tin client header để chống spoofing)
    const clientIp = req.socket?.remoteAddress ?? req.ip ?? '127.0.0.1';
    req.headers['x-forwarded-for'] = clientIp;
  }
}
