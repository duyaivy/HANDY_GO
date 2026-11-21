import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@app/config';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const provided = context.switchToHttp().getRequest().headers[
      'x-internal-secret'
    ];
    const expected = this.config.internalServiceSecret;
    if (typeof provided !== 'string' || !expected) {
      throw new ForbiddenException('Internal service authorization required');
    }
    const actual = Buffer.from(provided);
    const secret = Buffer.from(expected);
    if (actual.length !== secret.length || !timingSafeEqual(actual, secret)) {
      throw new ForbiddenException('Internal service authorization required');
    }
    return true;
  }
}
