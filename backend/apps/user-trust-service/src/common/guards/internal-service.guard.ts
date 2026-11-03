import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@app/config';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secret =
      request.headers['x-internal-secret'] ||
      request.headers['x-service-token'] ||
      '';

    const expectedSecret =
      this.config?.internalServiceSecret || process.env.INTERNAL_SERVICE_SECRET;

    if (!expectedSecret || !secret) {
      throw new ForbiddenException(
        'Access denied: internal service authorization required (x-internal-secret)',
      );
    }

    const secretBuf = Buffer.from(String(secret));
    const expectedBuf = Buffer.from(String(expectedSecret));

    if (
      secretBuf.length !== expectedBuf.length ||
      !timingSafeEqual(secretBuf, expectedBuf)
    ) {
      throw new ForbiddenException(
        'Access denied: internal service authorization required (x-internal-secret)',
      );
    }

    return true;
  }
}
