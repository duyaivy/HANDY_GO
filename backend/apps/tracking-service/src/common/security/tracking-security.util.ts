import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';

export interface GatewayUser {
  userId: string;
  roles: string[];
  isAdmin: boolean;
  isCustomer: boolean;
  isWorker: boolean;
}

/**
 * Asserts that the incoming request originated from the trusted API Gateway.
 */
export function assertTrustedGateway(
  incomingSecret: string | undefined,
  expectedSecret: string,
): void {
  const expected = Buffer.from(expectedSecret || '');
  const incoming = Buffer.from(incomingSecret || '');

  const isValid =
    expected.length > 0 &&
    incoming.length === expected.length &&
    timingSafeEqual(incoming, expected);

  if (!isValid) {
    throw new ForbiddenException(
      'Yêu cầu phải bắt nguồn từ API Gateway đáng tin cậy',
    );
  }
}

/**
 * Extracts and validates the authenticated user identity from trusted gateway headers.
 */
export function extractGatewayUser(
  userIdHeader: string | undefined,
  userRolesHeader: string | undefined,
): GatewayUser {
  if (!userIdHeader || !isUUID(userIdHeader)) {
    throw new UnauthorizedException('Yêu cầu phải có định danh người dùng hợp lệ');
  }

  const rawRoles = userRolesHeader ? userRolesHeader.split(',') : [];
  const roles = rawRoles.map((r) => r.trim()).filter(Boolean);

  const normalized = roles.map((r) => r.toLowerCase());
  const isAdmin = normalized.includes('admin');
  const isCustomer = normalized.includes('customer');
  const isWorker = normalized.includes('worker');

  return {
    userId: userIdHeader,
    roles,
    isAdmin,
    isCustomer,
    isWorker,
  };
}
