import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { ConfigService } from '@app/config';
import {
  normalizeClientIp,
  resolveClientIp,
} from './client-ip.util.js';
import {
  FORWARDED_FOR_HEADER,
  INTERNAL_GATEWAY_HEADER,
} from '../constants/auth.constants.js';

describe('Client IP Resolution & Normalization Utility', () => {
  describe('normalizeClientIp', () => {
    it('strips IPv4-mapped IPv6 prefix (::ffff:)', () => {
      expect(normalizeClientIp('::ffff:192.168.1.100')).toBe('192.168.1.100');
      expect(normalizeClientIp('::ffff:203.0.113.195')).toBe('203.0.113.195');
    });

    it('normalizes IPv6 localhost (::1) to 127.0.0.1', () => {
      expect(normalizeClientIp('::1')).toBe('127.0.0.1');
    });

    it('preserves valid IPv4 and IPv6 addresses', () => {
      expect(normalizeClientIp('10.0.0.1')).toBe('10.0.0.1');
      expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1');
    });

    it('falls back when given invalid, empty, or non-string input', () => {
      expect(normalizeClientIp('')).toBe('127.0.0.1');
      expect(normalizeClientIp(null as any)).toBe('127.0.0.1');
      expect(normalizeClientIp(undefined)).toBe('127.0.0.1');
      expect(normalizeClientIp('invalid-ip-string')).toBe('127.0.0.1');
      expect(normalizeClientIp('invalid-ip', '10.0.0.1')).toBe('10.0.0.1');
    });

    it('trims whitespace', () => {
      expect(normalizeClientIp('  203.0.113.50  ')).toBe('203.0.113.50');
    });
  });

  describe('resolveClientIp', () => {
    const configMock = {
      internalServiceSecret: 'super-gateway-secret-handygo',
    } as unknown as ConfigService;

    it('trusts x-forwarded-for header when internal gateway secret matches', () => {
      const req = {
        headers: {
          [INTERNAL_GATEWAY_HEADER]: 'super-gateway-secret-handygo',
          [FORWARDED_FOR_HEADER]: '203.0.113.10, 10.0.0.2',
        },
      } as unknown as Request;

      expect(resolveClientIp(configMock, req)).toBe('203.0.113.10');
    });

    it('rejects x-forwarded-for when internal gateway secret is missing or mismatched', () => {
      const reqMissing = {
        headers: {
          [FORWARDED_FOR_HEADER]: '198.51.100.1',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(resolveClientIp(configMock, reqMissing)).toBe('127.0.0.1');

      const reqMismatched = {
        headers: {
          [INTERNAL_GATEWAY_HEADER]: 'wrong-secret',
          [FORWARDED_FOR_HEADER]: '198.51.100.1',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(resolveClientIp(configMock, reqMismatched)).toBe('127.0.0.1');
    });

    it('normalizes IPv4-mapped IPv6 from socket or fallback', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '::ffff:192.168.1.5' },
      } as unknown as Request;

      expect(resolveClientIp(configMock, req)).toBe('192.168.1.5');
    });
  });
});
