import { describe, expect, it } from 'vitest';
import {
  formatDateToYYYYMMDD,
  generateOrderCode,
  generateRandomSuffix,
  generateRequestCode,
} from './code-generator.util.js';

describe('CodeGeneratorUtil', () => {
  describe('formatDateToYYYYMMDD', () => {
    it('should format a specific date as YYYYMMDD in UTC', () => {
      const fixedDate = new Date(Date.UTC(2026, 9, 23)); // 2026-10-23
      expect(formatDateToYYYYMMDD(fixedDate)).toBe('20261023');
    });

    it('should handle single-digit months and days with leading zeros', () => {
      const singleDigitDate = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05
      expect(formatDateToYYYYMMDD(singleDigitDate)).toBe('20260105');
    });
  });

  describe('generateRandomSuffix', () => {
    it('should generate a suffix of default length 4', () => {
      const suffix = generateRandomSuffix();
      expect(suffix).toHaveLength(4);
      expect(suffix).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    });

    it('should generate a suffix of custom length', () => {
      const suffix = generateRandomSuffix(8);
      expect(suffix).toHaveLength(8);
      expect(suffix).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    });
  });

  describe('generateRequestCode', () => {
    it('should generate code matching REQ-YYYYMMDD-XXXX pattern', () => {
      const code = generateRequestCode();
      expect(code).toMatch(/^REQ-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    });

    it('should use provided date when given', () => {
      const fixedDate = new Date(Date.UTC(2026, 11, 31));
      const code = generateRequestCode(fixedDate);
      expect(code.startsWith('REQ-20261231-')).toBe(true);
    });

    it('should generate unique codes in subsequent calls', () => {
      const code1 = generateRequestCode();
      const code2 = generateRequestCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('generateOrderCode', () => {
    it('should generate code matching ORD-YYYYMMDD-XXXX pattern', () => {
      const code = generateOrderCode();
      expect(code).toMatch(/^ORD-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    });

    it('should use provided date when given', () => {
      const fixedDate = new Date(Date.UTC(2026, 4, 1));
      const code = generateOrderCode(fixedDate);
      expect(code.startsWith('ORD-20260501-')).toBe(true);
    });

    it('should generate unique codes in subsequent calls', () => {
      const code1 = generateOrderCode();
      const code2 = generateOrderCode();
      expect(code1).not.toBe(code2);
    });
  });
});
