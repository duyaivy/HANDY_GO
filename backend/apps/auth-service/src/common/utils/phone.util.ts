import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Standardize Vietnamese phone numbers to E.164 format (+84xxxxxxxxx).
 * Valid VN mobile numbers have 10 digits starting with 03, 05, 07, 08, 09.
 * Handles inputs like:
 * - '0912345678'
 * - '+84912345678'
 * - '84912345678'
 * - '840912345678' / '+840912345678' (leading zero with country code)
 * - '(+84) 912-345-678'
 */
export function normalizeVietnamesePhone(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new BadRequestException('Số điện thoại không hợp lệ');
  }

  const trimmed = rawPhone.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException('Số điện thoại không hợp lệ');
  }

  // Parse phone number with default country code 'VN'
  const phoneNumber = parsePhoneNumberFromString(trimmed, 'VN');

  if (!phoneNumber || !phoneNumber.isValid() || phoneNumber.country !== 'VN') {
    throw new BadRequestException(
      'Số điện thoại không đúng định dạng di động Việt Nam',
    );
  }

  // Validate standard Vietnamese mobile prefix: +84 followed by 9 digits starting with 3, 5, 7, 8, 9
  const vnMobileRegex = /^\+84[35789]\d{8}$/;
  if (!vnMobileRegex.test(phoneNumber.number)) {
    throw new BadRequestException(
      'Số điện thoại không đúng định dạng di động Việt Nam',
    );
  }

  return phoneNumber.number;
}

/**
 * Checks whether a raw phone number string is a valid Vietnamese mobile phone number.
 */
export function isValidVietnamesePhone(rawPhone: string): boolean {
  try {
    normalizeVietnamesePhone(rawPhone);
    return true;
  } catch {
    return false;
  }
}
