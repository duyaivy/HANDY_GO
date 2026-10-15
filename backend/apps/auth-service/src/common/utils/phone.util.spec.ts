import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  normalizeVietnamesePhone,
  isValidVietnamesePhone,
} from './phone.util.js';

describe('normalizeVietnamesePhone', () => {
  it('should normalize standard local numbers (09x, 03x, 07x, 08x, 05x)', () => {
    expect(normalizeVietnamesePhone('0912345678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('0321234567')).toBe('+84321234567');
    expect(normalizeVietnamesePhone('0701234567')).toBe('+84701234567');
    expect(normalizeVietnamesePhone('0811234567')).toBe('+84811234567');
    expect(normalizeVietnamesePhone('0561234567')).toBe('+84561234567');
  });

  it('should correctly handle 840... and +840... redundant leading zero prefix', () => {
    expect(normalizeVietnamesePhone('840912345678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('+840912345678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('840321234567')).toBe('+84321234567');
    expect(normalizeVietnamesePhone('+840321234567')).toBe('+84321234567');
  });

  it('should handle standard international format (+84 and 84)', () => {
    expect(normalizeVietnamesePhone('+84912345678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('84912345678')).toBe('+84912345678');
  });

  it('should handle formatted numbers with spaces, dashes, parentheses', () => {
    expect(normalizeVietnamesePhone('091 234 5678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('091-234-5678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('(+84) 912 345 678')).toBe('+84912345678');
    expect(normalizeVietnamesePhone('+84 (0) 912 345 678')).toBe('+84912345678');
  });

  it('should throw BadRequestException for invalid or empty inputs', () => {
    expect(() => normalizeVietnamesePhone('')).toThrow(BadRequestException);
    expect(() => normalizeVietnamesePhone('   ')).toThrow(BadRequestException);
    expect(() => normalizeVietnamesePhone(null as unknown as string)).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizeVietnamesePhone(undefined as unknown as string),
    ).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for non-Vietnamese numbers', () => {
    expect(() => normalizeVietnamesePhone('+14155552671')).toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException for landline numbers or invalid prefixes', () => {
    // Hanoi landline 024...
    expect(() => normalizeVietnamesePhone('0243123456')).toThrow(
      BadRequestException,
    );
    // Malformed length
    expect(() => normalizeVietnamesePhone('12345')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeVietnamesePhone('091234567')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeVietnamesePhone('abcdefghij')).toThrow(
      BadRequestException,
    );
  });
});

describe('isValidVietnamesePhone', () => {
  it('should return true for valid numbers and false for invalid numbers', () => {
    expect(isValidVietnamesePhone('0912345678')).toBe(true);
    expect(isValidVietnamesePhone('840912345678')).toBe(true);
    expect(isValidVietnamesePhone('+840912345678')).toBe(true);
    expect(isValidVietnamesePhone('0243123456')).toBe(false);
    expect(isValidVietnamesePhone('12345')).toBe(false);
    expect(isValidVietnamesePhone('')).toBe(false);
  });
});
