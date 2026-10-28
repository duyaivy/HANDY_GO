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
import { ORDER_CONSTANTS } from '../constants/order.constants.js';

@Injectable()
export class TrustedGatewayGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = req.headers[ORDER_CONSTANTS.HEADER_INTERNAL_SECRET];
    const expectedSecret = this.config.internalServiceSecret;

    if (!expectedSecret) {
      throw new ForbiddenException(
        'Request must originate from the API Gateway (internal secret unconfigured)',
      );
    }

    const expected = Buffer.from(expectedSecret);
    const incoming = Buffer.from(typeof secret === 'string' ? secret : '');

    if (
      !incoming.length ||
      incoming.length !== expected.length ||
      !timingSafeEqual(incoming, expected)
    ) {
      throw new ForbiddenException(
        'Request must originate from the API Gateway',
      );
    }

    const userId = req.headers[ORDER_CONSTANTS.HEADER_USER_ID];
    if (typeof userId !== 'string' || !isUUID(userId)) {
      throw new UnauthorizedException('A valid authenticated user is required');
    }

    return true;
  }
}
