import {
  Injectable,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ORDER_CONSTANTS } from '../constants/order.constants.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const rolesHeader = req.headers[ORDER_CONSTANTS.HEADER_USER_ROLES];

    if (!rolesHeader || typeof rolesHeader !== 'string') {
      throw new ForbiddenException(
        'Chỉ quản trị viên mới có quyền thực hiện thao tác này.',
      );
    }

    const roles = rolesHeader.split(',').map((r) => r.trim().toLowerCase());
    if (!roles.includes(ORDER_CONSTANTS.ROLE_ADMIN.toLowerCase())) {
      throw new ForbiddenException(
        'Chỉ quản trị viên mới có quyền thực hiện thao tác này.',
      );
    }

    return true;
  }
}
