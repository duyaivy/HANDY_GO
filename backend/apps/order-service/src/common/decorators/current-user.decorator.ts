import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ORDER_CONSTANTS } from '../constants/order.constants.js';

export interface RequestUserIdentity {
  userId: string;
  accountId?: string;
  roles: string[];
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUserIdentity => {
    const request = ctx.switchToHttp().getRequest();
    const userId =
      (request.headers[ORDER_CONSTANTS.HEADER_USER_ID] as string) ||
      request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException(
        'Missing user identity in request headers (x-user-id)',
      );
    }

    const rolesHeader =
      (request.headers[ORDER_CONSTANTS.HEADER_USER_ROLES] as string) || '';
    const roles = rolesHeader
      ? rolesHeader.split(',').map((r: string) => r.trim())
      : request.user?.roles ?? [];

    const permissionsHeader =
      (request.headers['x-user-permissions'] as string) || '';
    const permissions = permissionsHeader
      ? permissionsHeader.split(',').map((p: string) => p.trim())
      : request.user?.permissions ?? [];

    return {
      userId,
      accountId:
        (request.headers['x-user-account-id'] as string) ||
        request.user?.accountId,
      roles,
      permissions,
    };
  },
);

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const userId =
      (request.headers[ORDER_CONSTANTS.HEADER_USER_ID] as string) ||
      request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException(
        'Missing user identity in request headers (x-user-id)',
      );
    }

    return userId;
  },
);
