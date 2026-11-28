import { describe, expect, it } from 'vitest';
import { Role } from '@app/auth';
import {
  containsContactInformation,
  isAdminRole,
  maskEmail,
  maskPhone,
  maskSensitive,
  sanitizePublicText,
} from './mask.util.js';

describe('mask.util', () => {
  describe('isAdminRole', () => {
    it('returns true for Admin role (case-insensitive)', () => {
      expect(isAdminRole([Role.ADMIN])).toBe(true);
      expect(isAdminRole(['admin'])).toBe(true);
      expect(isAdminRole([Role.CUSTOMER, Role.ADMIN])).toBe(true);
    });

    it('returns false for non-Admin or missing roles', () => {
      expect(isAdminRole([Role.CUSTOMER])).toBe(false);
      expect(isAdminRole([Role.WORKER])).toBe(false);
      expect(isAdminRole([])).toBe(false);
      expect(isAdminRole(undefined)).toBe(false);
      expect(isAdminRole(null)).toBe(false);
    });
  });

  describe('maskPhone', () => {
    it('masks Vietnamese local and +84 phone numbers to 2 first + *** + 2 last', () => {
      expect(maskPhone('0912345678')).toBe('09***78');
      expect(maskPhone('+84912345678')).toBe('09***78');
      expect(maskPhone('0912 345 678')).toBe('09***78');
    });

    it('masks international and short phone numbers safely', () => {
      expect(maskPhone('+14155552671')).toBe('+1***71');
      expect(maskPhone('1234')).toBe('1***');
      expect(maskPhone('1')).toBe('*');
    });

    it('preserves null/undefined/empty values', () => {
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone(undefined)).toBeNull();
      expect(maskPhone('')).toBe('');
    });
  });

  describe('maskEmail', () => {
    it('masks standard email exposing first 2 and last 2 chars of local part', () => {
      expect(maskEmail('nguyenvan@gmail.com')).toBe('ng***an@gmail.com');
      expect(maskEmail('abcde@gmail.com')).toBe('ab***de@gmail.com');
    });

    it('masks short local part (<= 4 chars) exposing only first char', () => {
      expect(maskEmail('abcd@gmail.com')).toBe('a***@gmail.com');
      expect(maskEmail('ab@gmail.com')).toBe('a***@gmail.com');
      expect(maskEmail('a@gmail.com')).toBe('*@gmail.com');
    });

    it('preserves null/undefined/empty values', () => {
      expect(maskEmail(null)).toBeNull();
      expect(maskEmail(undefined)).toBeNull();
      expect(maskEmail('')).toBe('');
    });
  });

  describe('maskSensitive', () => {
    it('masks arbitrary sensitive strings exposing first 2 and last 2 chars', () => {
      expect(maskSensitive('123 Nguyen Trai, Q1')).toBe('12***Q1');
      expect(maskSensitive('079123456789')).toBe('07***89');
      expect(maskSensitive('abcd')).toBe('a***');
      expect(maskSensitive('a')).toBe('*');
      expect(maskSensitive(null)).toBeNull();
    });
  });

  describe('containsContactInformation & sanitizePublicText', () => {
    it('detects phone numbers, emails, URLs, social handles, and messaging platforms', () => {
      expect(containsContactInformation('Liên hệ 0912345678 nhé')).toBe(true);
      expect(containsContactInformation('Call +84 912 345 678')).toBe(true);
      expect(containsContactInformation('Mail: tho.dien@gmail.com')).toBe(true);
      expect(containsContactInformation('Kết bạn Zalo mình')).toBe(true);
      expect(containsContactInformation('Xem tại https://example.com')).toBe(true);
      expect(containsContactInformation('Inbox @thodien123')).toBe(true);
    });

    it('allows normal service descriptions and experience numbers', () => {
      expect(containsContactInformation('Thợ điện nước 10 năm kinh nghiệm, hỗ trợ 24/7')).toBe(false);
      expect(containsContactInformation('Nạp gas R32/R410A, vệ sinh điều hòa Panasonic')).toBe(false);
      expect(containsContactInformation(null)).toBe(false);
    });

    it('sanitizes embedded phones, emails, and off-platform contacts in public text', () => {
      const sanitized = sanitizePublicText(
        'Thợ 10 năm kinh nghiệm, gọi 0912345678 hoặc email nguyenvan@gmail.com qua Zalo',
      );
      expect(sanitized).toContain('09***78');
      expect(sanitized).toContain('ng***an@gmail.com');
      expect(sanitized).not.toContain('0912345678');
      expect(sanitized).not.toContain('nguyenvan@gmail.com');
      expect(sanitized).not.toMatch(/\bzalo\b/i);
      expect(sanitizePublicText(null)).toBeNull();
    });
  });
});
