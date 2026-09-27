import { Injectable } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';

@Injectable()
export class RateLimiterService {
  constructor(private readonly db: AuthPrismaService) {}

  async checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number,
    errorMessage = 'Bạn đã vượt quá giới hạn yêu cầu. Vui lòng thử lại sau.',
  ): Promise<void> {
    const now = new Date();
    const entry = await this.db.rateLimit.findUnique({
      where: { key },
    });

    if (!entry || entry.expireAt <= now) {
      const expireAt = new Date(now.getTime() + windowSeconds * 1000);
      await this.db.rateLimit.upsert({
        where: { key },
        create: { key, points: 1, expireAt },
        update: { points: 1, expireAt },
      });
      return;
    }

    if (entry.points >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.expireAt.getTime() - now.getTime()) / 1000),
      );
      throw new AppException(429, ERROR_CODES.RATE_LIMITED, errorMessage, {
        details: { retryAfterSeconds },
      });
    }

    await this.db.rateLimit.update({
      where: { key },
      data: { points: { increment: 1 } },
    });
  }

  async checkFailedLogins(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    const now = new Date();
    const entry = await this.db.rateLimit.findUnique({ where: { key } });
    if (entry && entry.expireAt > now && entry.points >= 5) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.expireAt.getTime() - now.getTime()) / 1000),
      );
      throw new AppException(
        429,
        ERROR_CODES.RATE_LIMITED,
        'Bạn đã nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau 15 phút.',
        { details: { retryAfterSeconds } },
      );
    }
  }

  async recordFailedLogin(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    const windowSeconds = 15 * 60; // 15 minutes
    const now = new Date();
    const entry = await this.db.rateLimit.findUnique({ where: { key } });

    if (!entry || entry.expireAt <= now) {
      const expireAt = new Date(now.getTime() + windowSeconds * 1000);
      await this.db.rateLimit.upsert({
        where: { key },
        create: { key, points: 1, expireAt },
        update: { points: 1, expireAt },
      });
      return;
    }

    await this.db.rateLimit.update({
      where: { key },
      data: { points: { increment: 1 } },
    });
  }

  async resetFailedLogins(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    await this.db.rateLimit.deleteMany({ where: { key } });
  }
}
