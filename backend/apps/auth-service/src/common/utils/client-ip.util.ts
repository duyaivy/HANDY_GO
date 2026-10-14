import type { Request } from 'express';
import crypto from 'node:crypto';
import net from 'node:net';
import { ConfigService } from '@app/config';
import {
  FORWARDED_FOR_HEADER,
  INTERNAL_GATEWAY_HEADER,
} from '../constants/auth.constants.js';

/**
 * Normalizes and validates an IP address string:
 * - Strips IPv4-mapped IPv6 prefix (e.g., `::ffff:192.168.1.1` -> `192.168.1.1`)
 * - Converts IPv6 loopback `::1` to `127.0.0.1`
 * - Validates using `net.isIP`
 * - Falls back to safe fallback IP if invalid
 */
export function normalizeClientIp(
  ip?: string | null,
  fallback = '127.0.0.1',
): string {
  if (!ip || typeof ip !== 'string') {
    return fallback;
  }

  let cleaned = ip.trim();

  // Strip IPv4-mapped IPv6 prefix
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }

  // Normalize IPv6 localhost
  if (cleaned === '::1') {
    return '127.0.0.1';
  }

  if (net.isIP(cleaned) > 0) {
    return cleaned;
  }

  return fallback;
}

/**
 * Only trusts forwarded client IP when the request includes a valid internal gateway secret.
 * If secret is missing or mismatched, strictly falls back to socket IP.
 */
export function resolveClientIp(
  config: ConfigService,
  req: Request,
  fallbackIp?: string,
): string {
  const incomingSecret = req?.headers?.[INTERNAL_GATEWAY_HEADER];
  const expectedSecret = config.internalServiceSecret;

  const isTrustedGateway = Boolean(
    expectedSecret &&
      typeof incomingSecret === 'string' &&
      incomingSecret.length === expectedSecret.length &&
      crypto.timingSafeEqual(
        Buffer.from(incomingSecret),
        Buffer.from(expectedSecret),
      ),
  );

  if (isTrustedGateway) {
    const forwarded = req?.headers?.[FORWARDED_FOR_HEADER];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      const firstHop = forwarded.split(',')[0].trim();
      return normalizeClientIp(firstHop, fallbackIp || '127.0.0.1');
    }
  }

  const rawIp =
    fallbackIp ||
    req?.socket?.remoteAddress ||
    req?.ip ||
    '127.0.0.1';

  return normalizeClientIp(rawIp, '127.0.0.1');
}

