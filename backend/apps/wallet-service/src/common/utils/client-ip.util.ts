import type { Request } from 'express';
import crypto from 'node:crypto';
import net from 'node:net';
import type { ConfigService } from '@app/config';

export function normalizeClientIp(ip?: string | null, fallback = '127.0.0.1'): string {
  if (!ip || typeof ip !== 'string') return fallback;
  let value = ip.trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') value = '127.0.0.1';
  return net.isIP(value) ? value : fallback;
}

export function resolveClientIp(config: ConfigService, req: Request, fallbackIp?: string): string {
  const incoming = req?.headers?.['x-internal-secret'];
  const expected = config.internalServiceSecret;
  const trusted = Boolean(expected && typeof incoming === 'string' && incoming.length === expected.length && crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected)));
  if (trusted) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return normalizeClientIp(forwarded.split(',')[0], fallbackIp);
  }
  return normalizeClientIp(fallbackIp || req?.socket?.remoteAddress || req?.ip);
}
