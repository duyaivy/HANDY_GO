import { BadRequestException } from '@nestjs/common';

/**
 * Standardize Vietnamese phone numbers to E.164 format (+84xxxxxxxxx).
 * Valid VN mobile numbers have 10 digits starting with 03, 05, 07, 08, 09.
 */
export function normalizeVietnamesePhone(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new BadRequestException('Số điện thoại không hợp lệ');
  }

  // Remove spaces, dashes, dots, parentheses
  let cleaned = rawPhone.replace(/[\s\-.()]/g, '');

  // Handle prefix
  if (cleaned.startsWith('+84')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('84')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  } else {
    throw new BadRequestException('Số điện thoại Việt Nam phải bắt đầu bằng 0, 84 hoặc +84');
  }

  // Must have exactly 9 digits remaining, starting with 3, 5, 7, 8, 9
  const vnMobileRegex = /^(3|5|7|8|9)\d{8}$/;
  if (!vnMobileRegex.test(cleaned)) {
    throw new BadRequestException('Số điện thoại không đúng định dạng di động Việt Nam');
  }

  return `+84${cleaned}`;
}
