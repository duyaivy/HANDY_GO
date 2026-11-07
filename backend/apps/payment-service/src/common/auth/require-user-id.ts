import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '@app/auth';
import { isUUID } from 'class-validator';

export function requireUserId(user: AuthenticatedUser | undefined): string {
  if (!user || !isUUID(user.userId)) throw new UnauthorizedException('A valid authenticated user is required');
  return user.userId;
}
