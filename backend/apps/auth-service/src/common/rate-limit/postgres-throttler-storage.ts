import type { ThrottlerStorage, ThrottlerStorageRecord } from '@nestjs/throttler';
import { Prisma } from '@prisma/auth-client';
import type { AuthPrismaService } from '@app/database';

export class PostgresThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly db: AuthPrismaService) {}

  /**
   * Cập nhật nguyên tử bộ đếm rate limit trong bảng PostgreSQL `rate_limits`.
   * Sử dụng câu lệnh INSERT ... ON CONFLICT DO UPDATE nguyên tử:
   * - Nếu bản ghi chưa tồn tại: khởi tạo points = 1 và expireAt = NOW() + ttl.
   * - Nếu bản ghi đã hết hạn (expireAt <= NOW()): reset points = 1 và cập nhật expireAt mới.
   * - Nếu bản ghi còn hiệu lực: tăng points = points + 1 và giữ nguyên expireAt hiện tại.
   * Tất cả các instance đều đọc/ghi chung một bảng, ngăn chặn race condition giữa các instance.
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = new Date();
    const expireAt = new Date(now.getTime() + ttl);
    const schema = this.db?.schema || 'auth_service';
    const tableName = Prisma.raw(`"${schema}"."rate_limits"`);

    const rows = await this.db.$queryRaw<
      Array<{ points: number | bigint; expireAt: Date | string }>
    >`
      INSERT INTO ${tableName} AS r ("key", "points", "expireAt")
      VALUES (${key}, 1, ${expireAt})
      ON CONFLICT ("key") DO UPDATE
      SET 
        "points" = CASE 
          WHEN r."expireAt" <= NOW() THEN 1 
          ELSE r."points" + 1 
        END,
        "expireAt" = CASE 
          WHEN r."expireAt" <= NOW() THEN ${expireAt} 
          ELSE r."expireAt" 
        END
      RETURNING "points", "expireAt"
    `;

    const record = rows[0]!;
    const points = Number(record.points);
    const expireAtDate = new Date(record.expireAt);
    const timeToExpire = Math.max(
      1,
      Math.ceil((expireAtDate.getTime() - Date.now()) / 1000),
    );
    const isBlocked = points > limit;

    return {
      totalHits: points,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
