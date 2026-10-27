import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import type { Request } from 'express';
import {
  assertTrustedGateway,
  extractGatewayUser,
  type GatewayUser,
} from './tracking-security.util.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      gatewayUser?: GatewayUser;
    }
  }
}

@Injectable()
export class TrustedGatewayGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = req.headers['x-internal-secret'] as string | undefined;

    // 1. Validate internal gateway secret
    assertTrustedGateway(secret, this.config.internalServiceSecret);

    // 2. Validate and attach gateway user
    const userId = req.headers['x-user-id'] as string | undefined;
    const userRoles = req.headers['x-user-roles'] as string | undefined;
    req.gatewayUser = extractGatewayUser(userId, userRoles);

    return true;
  }
}
