import {
  Injectable,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Role } from '@app/auth';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const rolesHeader = req.headers['x-user-roles'];

    if (!rolesHeader || typeof rolesHeader !== 'string') {
      throw new ForbiddenException(
        'Chỉ quản trị viên mới có quyền thực hiện thao tác này.',
      );
    }

    const roles = rolesHeader.split(',').map((r) => r.trim().toLowerCase());
    if (!roles.includes(Role.ADMIN.toLowerCase())) {
      throw new ForbiddenException(
        'Chỉ quản trị viên mới có quyền thực hiện thao tác này.',
      );
    }

    return true;
  }
}
