import { HttpStatus } from '@nestjs/common';
import crypto from 'node:crypto';
import { AppException, ERROR_CODES } from '@app/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertTrustedSecret(expected: string | undefined, supplied: string | undefined): void {
  const ok =
    !!expected &&
    !!supplied &&
    supplied.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!ok) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Trusted service authentication required');
}

export const WALLET_PERMISSIONS = {
  adjust: 'wallet:adjust',
  dlqRead: 'wallet:dlq:read',
  dlqReplay: 'wallet:dlq:replay',
  auditRead: 'wallet:audit:read',
} as const;

/** Trả actor id (UUID) lấy từ x-user-id do Gateway inject; yêu cầu role admin. */
export function requireAdminActor(roles: string | undefined, userId: string | undefined): string {
  const isAdmin = (roles ?? '').split(',').some((role) => role.trim().toLowerCase() === 'admin');
  if (!isAdmin) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Admin role required');
  if (!userId || !UUID_REGEX.test(userId.trim())) {
    throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Actor identity required');
  }
  return userId.trim();
}

/** Admin + permission cụ thể (x-user-permissions do Gateway inject, phân tách bằng dấu phẩy). */
export function requireAdminPermission(
  roles: string | undefined,
  userId: string | undefined,
  permissions: string | undefined,
  required: string,
): string {
  const actor = requireAdminActor(roles, userId);
  const granted = (permissions ?? '').split(',').map((p) => p.trim().toLowerCase());
  if (!granted.includes(required)) {
    throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, `Permission ${required} required`);
  }
  return actor;
}
