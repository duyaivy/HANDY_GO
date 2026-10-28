import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@app/config';
import { ORDER_CONSTANTS } from '../../common/constants/order.constants.js';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers[ORDER_CONSTANTS.HEADER_INTERNAL_SECRET];
    const expected = this.configService.internalServiceSecret;

    if (!provided || !expected) {
      throw new UnauthorizedException(
        'Invalid or missing internal service secret',
      );
    }

    const providedBuf = Buffer.from(String(provided));
    const expectedBuf = Buffer.from(String(expected));

    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new UnauthorizedException(
        'Invalid or missing internal service secret',
      );
    }

    return true;
  }
}
