import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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

    // 1. Secret header match
    if (configuredSecret && secret === configuredSecret) {
      return true;
    }

    // 2. Authenticated user with Admin role
    const user = (request as any).user;
    if (user && Array.isArray(user.roles) && user.roles.includes('Admin')) {
      return true;
    }

    // 3. In test/dev environment when secret is not configured, permit internal calls
    if (
      process.env.NODE_ENV === 'test' ||
      (!configuredSecret && process.env.NODE_ENV !== 'production')
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Access denied: internal service authorization required',
    );
  }
}
