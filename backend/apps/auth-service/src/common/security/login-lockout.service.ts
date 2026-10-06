import { Injectable, Logger } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import {
  FAILED_LOGIN_LOCKOUT_SECONDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../constants/auth.constants.js';

export interface LockoutRecord {
  attempts: number;
  lockedUntil?: number;
  lastAttemptAt: number;
}

@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);
  private readonly records = new Map<string, LockoutRecord>();

  /**
   * Check if phone number is locked out due to exceeding maximum failed attempts.
   */
  async checkFailedLogins(phone: string): Promise<void> {
    const record = this.records.get(phone);
    if (!record) {
      return;
    }

    const now = Date.now();

    // If lockout duration has elapsed, clear expired lockout
    if (record.lockedUntil && record.lockedUntil <= now) {
      this.records.delete(phone);
      return;
    }

    if (record.lockedUntil && record.lockedUntil > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((record.lockedUntil - now) / 1000),
      );
      throw new AppException(
        429,
        ERROR_CODES.RATE_LIMITED,
        `Bạn đã nhập sai mật khẩu quá ${MAX_FAILED_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau ${Math.ceil(
          retryAfterSeconds / 60,
        )} phút.`,
        { details: { retryAfterSeconds } },
      );
    }
  }

  /**
   * Record a failed login attempt for a phone number.
   */
  async recordFailedLogin(phone: string): Promise<void> {
    const now = Date.now();
    const existing = this.records.get(phone);

    // If previous attempt was outside lockout window, start fresh
    const isStale =
      existing &&
      now - existing.lastAttemptAt > FAILED_LOGIN_LOCKOUT_SECONDS * 1000;

    const record: LockoutRecord =
      existing && !isStale
        ? existing
        : { attempts: 0, lastAttemptAt: now };

    record.attempts += 1;
    record.lastAttemptAt = now;

    if (record.attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      record.lockedUntil = now + FAILED_LOGIN_LOCKOUT_SECONDS * 1000;
      this.logger.warn(
        `Account with phone ${phone} locked out until ${new Date(record.lockedUntil).toISOString()} after ${record.attempts} failed attempts`,
      );
    }

    this.records.set(phone, record);
  }

  /**
   * Reset failed login counter upon successful authentication.
   */
  async resetFailedLogins(phone: string): Promise<void> {
    this.records.delete(phone);
  }
}
