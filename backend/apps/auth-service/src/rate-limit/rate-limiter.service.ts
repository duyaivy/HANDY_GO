import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import {
  FAILED_LOGIN_LOCKOUT_SECONDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../auth.constants.js';

@Injectable()
export class RateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly db: AuthPrismaService) {}

  onModuleInit(): void {
    // Periodically clean up expired rate limit records (every 10 minutes)
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredRecords();
    }, 10 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Periodic cleanup job for expired rate limit records.
   */
  async cleanupExpiredRecords(): Promise<number> {
    try {
      const result = await this.db.rateLimit.deleteMany({
        where: { expireAt: { lte: new Date() } },
      });
      if (result.count > 0) {
        this.logger.debug(`Cleaned up ${result.count} expired rate limit records`);
      }
      return result.count;
    } catch (err: unknown) {
      this.logger.warn(`Failed to cleanup expired rate limits: ${(err as Error)?.message}`);
      return 0;
    }
  }

  /**
   * Atomic check-and-increment using PostgreSQL single SQL statement with ON CONFLICT.
   */
  async checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number,
    errorMessage = 'Bạn đã vượt quá giới hạn yêu cầu. Vui lòng thử lại sau.',
  ): Promise<void> {
    const now = new Date();
    const expireAt = new Date(now.getTime() + windowSeconds * 1000);

    let points = 1;
    let effectiveExpireAt = expireAt;

    if (typeof this.db.$queryRaw === 'function') {
      try {
        const rows = await this.db.$queryRaw<
          Array<{ points: number; expireAt: Date }>
        >`
          INSERT INTO "rate_limits" ("key", "points", "expireAt")
          VALUES (${key}, 1, ${expireAt})
          ON CONFLICT ("key") DO UPDATE
          SET
            "points" = CASE
              WHEN "rate_limits"."expireAt" <= ${now} THEN 1
              ELSE "rate_limits"."points" + 1
            END,
            "expireAt" = CASE
              WHEN "rate_limits"."expireAt" <= ${now} THEN ${expireAt}
              ELSE "rate_limits"."expireAt"
            END
          RETURNING "points", "expireAt";
        `;

        if (rows && rows.length > 0) {
          points = Number(rows[0].points);
          effectiveExpireAt = new Date(rows[0].expireAt);
        }
      } catch {
        const fallback = await this.fallbackUpsert(key, windowSeconds, now);
        points = fallback.points;
        effectiveExpireAt = fallback.expireAt;
      }
    } else {
      const fallback = await this.fallbackUpsert(key, windowSeconds, now);
      points = fallback.points;
      effectiveExpireAt = fallback.expireAt;
    }

    if (points > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((effectiveExpireAt.getTime() - now.getTime()) / 1000),
      );
      throw new AppException(429, ERROR_CODES.RATE_LIMITED, errorMessage, {
        details: { retryAfterSeconds },
      });
    }
  }

  async checkFailedLogins(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    const now = new Date();
    const entry = await this.db.rateLimit.findUnique({ where: { key } });

    if (
      entry &&
      entry.expireAt > now &&
      entry.points >= MAX_FAILED_LOGIN_ATTEMPTS
    ) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.expireAt.getTime() - now.getTime()) / 1000),
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

  async recordFailedLogin(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    const now = new Date();
    const expireAt = new Date(
      now.getTime() + FAILED_LOGIN_LOCKOUT_SECONDS * 1000,
    );

    if (typeof this.db.$queryRaw === 'function') {
      try {
        await this.db.$queryRaw`
          INSERT INTO "rate_limits" ("key", "points", "expireAt")
          VALUES (${key}, 1, ${expireAt})
          ON CONFLICT ("key") DO UPDATE
          SET
            "points" = CASE
              WHEN "rate_limits"."expireAt" <= ${now} THEN 1
              ELSE "rate_limits"."points" + 1
            END,
            "expireAt" = CASE
              WHEN "rate_limits"."expireAt" <= ${now} THEN ${expireAt}
              ELSE "rate_limits"."expireAt"
            END;
        `;
        return;
      } catch {
        // Fallback below
      }
    }

    await this.fallbackUpsert(key, FAILED_LOGIN_LOCKOUT_SECONDS, now);
  }

  async resetFailedLogins(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    await this.db.rateLimit.deleteMany({ where: { key } });
  }

  private async fallbackUpsert(
    key: string,
    windowSeconds: number,
    now: Date,
  ): Promise<{ points: number; expireAt: Date }> {
    const entry = await this.db.rateLimit.findUnique({ where: { key } });

    if (!entry || entry.expireAt <= now) {
      const expireAt = new Date(now.getTime() + windowSeconds * 1000);
      await this.db.rateLimit.upsert({
        where: { key },
        create: { key, points: 1, expireAt },
        update: { points: 1, expireAt },
      });
      return { points: 1, expireAt };
    }

    const updated = await this.db.rateLimit.update({
      where: { key },
      data: { points: { increment: 1 } },
    });
    return { points: updated.points, expireAt: updated.expireAt };
  }
}
