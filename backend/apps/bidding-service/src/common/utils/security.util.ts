import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';

export function isTrustedGateway(
  incomingSecret: string | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!incomingSecret || !expectedSecret) return false;
  if (incomingSecret.length !== expectedSecret.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(incomingSecret),
    Buffer.from(expectedSecret),
  );
}

export function assertTrustedGateway(
  incomingSecret: string | undefined,
  expectedSecret: string | undefined,
): void {
  if (!isTrustedGateway(incomingSecret, expectedSecret)) {
    throw new ForbiddenException(
      'Request must originate from the trusted API Gateway or internal service',
    );
  }
}

export function extractWorkerIdentity(
  userId: string | undefined,
  userRoles: string | undefined,
): string {
  if (!userId) {
    throw new UnauthorizedException('Authentication required: missing user id');
  }
  const roles = userRoles ? userRoles.split(',').map((r) => r.trim().toLowerCase()) : [];
  if (!roles.includes('worker')) {
    throw new ForbiddenException('Only verified workers can perform this bidding action');
  }
  return userId;
}
