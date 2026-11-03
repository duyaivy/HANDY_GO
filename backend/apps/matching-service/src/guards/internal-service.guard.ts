import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret =
      request.headers['x-internal-secret'] ||
      request.headers['x-service-token'] ||
      '';

    const configuredSecret = process.env.INTERNAL_SERVICE_SECRET;

    // 1. Secret header match with timing-safe comparison
    if (configuredSecret && secret) {
      const secretBuf = Buffer.from(String(secret));
      const configuredBuf = Buffer.from(String(configuredSecret));

      if (
        secretBuf.length === configuredBuf.length &&
        timingSafeEqual(secretBuf, configuredBuf)
      ) {
        return true;
      }
    }

    throw new ForbiddenException(
      'Access denied: internal service authorization required (x-internal-secret)',
    );
  }
}
