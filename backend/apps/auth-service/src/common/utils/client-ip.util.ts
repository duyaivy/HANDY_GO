import type { Request } from 'express';
import crypto from 'node:crypto';
import { ConfigService } from '@app/config';
import {
  FORWARDED_FOR_HEADER,
  INTERNAL_GATEWAY_HEADER,
} from '../constants/auth.constants.js';

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
      return forwarded.split(',')[0].trim();
    }
  }

  return (
    fallbackIp ||
    req?.socket?.remoteAddress ||
    req?.ip ||
    '127.0.0.1'
  );
}
