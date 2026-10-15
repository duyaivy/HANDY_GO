import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.constants.js';
import { TokenVerifierService } from './token-verifier.service.js';
import type { AuthenticatedUser } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: TokenVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Thiếu mã truy cập Authorization');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Mã truy cập không đúng định dạng Bearer');
    }

    const payload = await this.tokenVerifier.verifyAccessToken(token);

    const authenticatedUser: AuthenticatedUser = {
      accountId: payload.sub,
      userId: payload.userId,
      sessionId: payload.sid,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };

    request.user = authenticatedUser;
    return true;
  }
}
