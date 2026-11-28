import { Role } from '@app/auth';

const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const PHONE_IN_TEXT_PATTERN = /(?:\+?\d)(?:[\s().-]*\d){8,14}/g;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const SOCIAL_HANDLE_PATTERN = /(^|\s)(@[a-z0-9_.]{3,})/gi;
const OFF_PLATFORM_CHANNEL_PATTERN =
  /\b(?:zalo|telegram|whatsapp|facebook|instagram|tiktok|wechat|viber|signal|m\.me|t\.me)\b/gi;

/**
 * Checks whether the caller holds the Admin role (case-insensitive).
 */
export function isAdminRole(roles?: readonly string[] | null): boolean {
  if (!Array.isArray(roles) || roles.length === 0) {
    return false;
  }
  const adminRole = Role.ADMIN.toLowerCase();
  return roles.some((role) => typeof role === 'string' && role.trim().toLowerCase() === adminRole);
}

/**
 * Masks sensitive strings (addresses, IDs, etc.), exposing only the first 2 and last 2 characters.
 */
export function maskSensitive(value?: string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  if (trimmed.length <= 1) {
    return '*';
  }
  if (trimmed.length <= 4) {
    return `${trimmed.slice(0, 1)}***`;
  }
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

/**
 * Masks a phone number, exposing only the first 2 and last 2 digits/characters.
 * Normalizes Vietnamese E.164 (+84...) numbers to leading 0 before masking.
 */
export function maskPhone(phone?: string | null): string | null {
  if (phone === null || phone === undefined) {
    return null;
  }
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const compact = trimmed.replace(/[\s.-]+/g, '');
  const normalized =
    compact.startsWith('+84') && compact.length > 3
      ? `0${compact.slice(3)}`
      : compact;
  return maskSensitive(normalized);
}

/**
 * Masks an email address, preserving the domain and exposing only the first 2 and last 2
 * characters of the local part (or only the first character if local part has 4 or fewer chars).
 */
export function maskEmail(email?: string | null): string | null {
  if (email === null || email === undefined) {
    return null;
  }
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0) {
    return maskSensitive(trimmed);
  }
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex);
  if (local.length <= 1) {
    return `*${domain}`;
  }
  if (local.length <= 4) {
    return `${local.slice(0, 1)}***${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-2)}${domain}`;
}

/**
 * Detects whether free-form public profile text contains contact details or off-platform channels
 * (phone numbers, emails, URLs, @handles, or messaging apps like Zalo/Telegram/Facebook).
 */
export function containsContactInformation(text?: string | null): boolean {
  if (!text || !text.trim()) {
    return false;
  }
  const normalized = text.normalize('NFKC');
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_IN_TEXT_PATTERN.lastIndex = 0;
  URL_PATTERN.lastIndex = 0;
  SOCIAL_HANDLE_PATTERN.lastIndex = 0;
  OFF_PLATFORM_CHANNEL_PATTERN.lastIndex = 0;
  return (
    EMAIL_PATTERN.test(normalized) ||
    PHONE_IN_TEXT_PATTERN.test(normalized) ||
    URL_PATTERN.test(normalized) ||
    SOCIAL_HANDLE_PATTERN.test(normalized) ||
    OFF_PLATFORM_CHANNEL_PATTERN.test(normalized)
  );
}

/**
 * Masks/redacts any contact details embedded inside free-form public profile text for non-admin callers.
 */
export function sanitizePublicText(text?: string | null): string | null {
  if (text === null || text === undefined) {
    return null;
  }
  if (!text.trim()) {
    return text;
  }
  return text
    .normalize('NFKC')
    .replace(EMAIL_PATTERN, (match) => maskEmail(match) ?? '***')
    .replace(PHONE_IN_TEXT_PATTERN, (match) => maskPhone(match) ?? '***')
    .replace(URL_PATTERN, '[đã ẩn liên hệ]')
    .replace(SOCIAL_HANDLE_PATTERN, (_, prefix: string) => `${prefix}[đã ẩn liên hệ]`)
    .replace(OFF_PLATFORM_CHANNEL_PATTERN, '[đã ẩn liên hệ]');
}
