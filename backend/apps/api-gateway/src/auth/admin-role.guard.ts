import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const rawUser = (req as any).user;
    const rolesHeader = req.headers['x-user-roles'];

    let roles: string[] = [];
    if (typeof rolesHeader === 'string' && rolesHeader.trim() !== '') {
      roles = rolesHeader.split(',').map((r) => r.trim().toLowerCase());
    } else if (rawUser?.roles && Array.isArray(rawUser.roles)) {
      roles = rawUser.roles.map((r: string) => String(r).trim().toLowerCase());
    }

    const userId = req.headers['x-user-id'] || rawUser?.userId;
    if (!userId && roles.length === 0) {
      throw new UnauthorizedException('Yêu cầu xác thực tài khoản để truy cập.');
    }

    if (!roles.includes('admin')) {
      throw new ForbiddenException(
        'Chỉ quản trị viên mới có quyền truy cập endpoint này.',
      );
    }

    return true;
  }
}

