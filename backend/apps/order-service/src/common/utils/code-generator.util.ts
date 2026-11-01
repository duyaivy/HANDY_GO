import { randomBytes } from 'node:crypto';

/**
 * Format a Date object as YYYYMMDD string in UTC.
 */
export function formatDateToYYYYMMDD(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Generate a random 4-character uppercase alphanumeric suffix.
 * Uses an unambiguous charset (excludes 0, O, 1, I).
 */
export function generateRandomSuffix(length = 4): string {
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Generate a unique Service Request Code: REQ-YYYYMMDD-XXXX
 * Example: REQ-20261023-A4K9
 */
export function generateRequestCode(date?: Date): string {
  const dateStr = formatDateToYYYYMMDD(date);
  const suffix = generateRandomSuffix(4);
  return `REQ-${dateStr}-${suffix}`;
}

/**
 * Generate a unique Order Code: ORD-YYYYMMDD-XXXX
 * Example: ORD-20261023-F7X2
 */
export function generateOrderCode(date?: Date): string {
  const dateStr = formatDateToYYYYMMDD(date);
  const suffix = generateRandomSuffix(4);
  return `ORD-${dateStr}-${suffix}`;
}
