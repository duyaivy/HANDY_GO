import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import crypto from 'node:crypto';

@Injectable()
export class TrustedGatewayGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const incomingSecret =
      request.headers['x-internal-secret'] ||
      (Array.isArray(request.headers['x-internal-secret'])
        ? request.headers['x-internal-secret'][0]
        : undefined);
    const expectedSecret = this.config.internalServiceSecret;

    const isValid =
      !!expectedSecret &&
      !!incomingSecret &&
      incomingSecret.length === expectedSecret.length &&
      crypto.timingSafeEqual(
        Buffer.from(incomingSecret),
        Buffer.from(expectedSecret),
      );

    if (!isValid) {
      throw new ForbiddenException(
        'Request must originate from trusted API Gateway or internal service',
      );
    }

    return true;
  }
}
