import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import crypto from 'node:crypto';
import { buildErrorResponse, ERROR_CODES } from '@app/common';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly globalLimiter: RateLimitRequestHandler;
  private readonly authLimiter: RateLimitRequestHandler;

  constructor() {
    const sendRateLimitResponse = (req: Request, res: Response): void => {
      const existingRequestId = req.headers['x-request-id'];
      const requestId =
        (Array.isArray(existingRequestId)
          ? existingRequestId[0]
          : existingRequestId) || crypto.randomUUID();

      res.status(429).json(
        buildErrorResponse(
          429,
          ERROR_CODES.RATE_LIMITED,
          'Too many requests, please try again later',
          {
            timestamp: new Date().toISOString(),
            path: req.originalUrl || req.url,
            requestId,
          },
        ),
      );
    };

    this.globalLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 100,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) =>
        sendRateLimitResponse(req as Request, res as Response),
    });

    this.authLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) =>
        sendRateLimitResponse(req as Request, res as Response),
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const pathname = req.originalUrl || req.url;

    if (
      pathname === '/api/v1/auth' ||
      pathname.startsWith('/api/v1/auth/') ||
      pathname.startsWith('/api/v1/auth?')
    ) {
      this.authLimiter(req, res, () => {
        this.globalLimiter(req, res, next);
      });
      return;
    }

    this.globalLimiter(req, res, next);
  }
}
