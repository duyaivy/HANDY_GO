import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@app/config';
import {
  createProxyMiddleware,
  fixRequestBody,
  type RequestHandler,
} from 'http-proxy-middleware';
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'node:net';
import crypto from 'node:crypto';
import { SERVICE_ROUTES, type ServiceRouteConfig } from './proxy.constants.js';

interface RouteHandlerEntry {
  readonly route: ServiceRouteConfig;
  readonly handler: RequestHandler;
}

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private readonly entries: RouteHandlerEntry[] = [];

  constructor(private readonly config: ConfigService) {
    this.initProxies();
  }

  private initProxies(): void {
    for (const route of SERVICE_ROUTES) {
      const targetUrl = this.config.getUrl(route.envKey);
      const timeoutMs = this.config.upstreamTimeoutMs;

      const handler = createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        ws: true,
        proxyTimeout: timeoutMs,
        timeout: timeoutMs,
        on: {
          proxyReq: (proxyReq, req) => {
            const clientReq = req as Request;
            const existingRequestId = clientReq.headers['x-request-id'];
            const requestId =
              (Array.isArray(existingRequestId)
                ? existingRequestId[0]
                : existingRequestId) || crypto.randomUUID();

            proxyReq.setHeader('x-request-id', requestId);
            fixRequestBody(proxyReq, req);
          },
          error: (err: Error, req, res) => {
            if (!('writeHead' in res)) {
              (res as Socket).destroy();
              return;
            }

            const clientRes = res as Response;
            if (clientRes.headersSent) {
              return;
            }

            const clientReq = req as Request;
            const errMessage = err.message || '';
            const isTimeout =
              errMessage.includes('ETIMEDOUT') ||
              errMessage.includes('ESOCKETTIMEDOUT') ||
              (err as { code?: string }).code === 'ECONNRESET';

            const statusCode = isTimeout ? 504 : 502;
            const errorCode = isTimeout
              ? 'GATEWAY_TIMEOUT'
              : 'BAD_GATEWAY';
            const message = isTimeout
              ? `${route.upstreamName} request timed out`
              : `${route.upstreamName} is unavailable`;

            const existingRequestId = clientReq.headers?.['x-request-id'];
            const requestId =
              (Array.isArray(existingRequestId)
                ? existingRequestId[0]
                : existingRequestId) || 'unknown';

            clientRes.status(statusCode).json({
              success: false,
              statusCode,
              errorCode,
              message,
              upstream: route.upstreamName,
              timestamp: new Date().toISOString(),
              path: clientReq.originalUrl || clientReq.url,
              requestId,
            });
          },
        },
      });

      this.entries.push({ route, handler });
    }
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const pathname = req.originalUrl || req.url;

    for (const { route, handler } of this.entries) {
      for (const prefix of route.prefixes) {
        if (
          pathname === prefix ||
          pathname.startsWith(`${prefix}/`) ||
          pathname.startsWith(`${prefix}?`)
        ) {
          handler(req, res, next);
          return;
        }
      }
    }

    next();
  }
}
