import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import { timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

@Injectable()
export class TrustedGatewayGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = req.headers['x-internal-secret'];
    const expected = Buffer.from(this.config.internalServiceSecret);
    const incoming = Buffer.from(typeof secret === 'string' ? secret : '');
    if (
      !expected.length ||
      incoming.length !== expected.length ||
      !timingSafeEqual(incoming, expected)
    ) {
      throw new ForbiddenException(
        'Request must originate from the API Gateway',
      );
    }
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !isUUID(userId)) {
      throw new UnauthorizedException('A valid authenticated user is required');
    }
    return true;
  }
}
