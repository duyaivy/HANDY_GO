import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PostgresThrottlerStorage } from './postgres-throttler-storage.js';
import type { AuthPrismaService } from '@app/database';

describe('PostgresThrottlerStorage (HG-31 Phase 4)', () => {
  let dbMock: any;
  let storage: PostgresThrottlerStorage;

  beforeEach(() => {
    dbMock = {
      $queryRaw: vi.fn(),
    };
    storage = new PostgresThrottlerStorage(dbMock as unknown as AuthPrismaService);
  });

  it('chèn bản ghi mới và trả về totalHits = 1 khi key chưa tồn tại', async () => {
    const expireAt = new Date(Date.now() + 3600000);
    dbMock.$queryRaw.mockResolvedValueOnce([{ points: 1, expireAt }]);

    const result = await storage.increment('test-key', 3600000, 5, 3600000, 'default');

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToExpire).toBeGreaterThan(0);
    expect(dbMock.$queryRaw).toHaveBeenCalledOnce();
  });

  it('tăng points và đánh dấu isBlocked = false khi chưa vượt quá limit', async () => {
    const expireAt = new Date(Date.now() + 3600000);
    dbMock.$queryRaw.mockResolvedValueOnce([{ points: 3, expireAt }]);

    const result = await storage.increment('test-key', 3600000, 5, 3600000, 'default');

    expect(result.totalHits).toBe(3);
    expect(result.isBlocked).toBe(false);
  });

  it('đánh dấu isBlocked = true khi points vượt quá limit', async () => {
    const expireAt = new Date(Date.now() + 3600000);
    dbMock.$queryRaw.mockResolvedValueOnce([{ points: 6, expireAt }]);

    const result = await storage.increment('test-key', 3600000, 5, 3600000, 'default');

    expect(result.totalHits).toBe(6);
    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('hai instance độc lập dùng chung cùng một DB chia sẻ cùng một bộ đếm rate limit', async () => {
    // Giả lập state DB dùng chung giữa 2 instance
    let sharedPoints = 0;
    const expireAt = new Date(Date.now() + 3600000);

    const sharedDbMock: any = {
      $queryRaw: vi.fn().mockImplementation(() => {
        sharedPoints++;
        return Promise.resolve([{ points: sharedPoints, expireAt }]);
      }),
    };

    // Khởi tạo 2 instance độc lập kết nối cùng database
    const instanceA = new PostgresThrottlerStorage(sharedDbMock);
    const instanceB = new PostgresThrottlerStorage(sharedDbMock);

    const limit = 5;

    // Instance A gọi 3 lần
    const resA1 = await instanceA.increment('user-shared-key', 3600000, limit, 3600000, 'default');
    const resA2 = await instanceA.increment('user-shared-key', 3600000, limit, 3600000, 'default');
    const resA3 = await instanceA.increment('user-shared-key', 3600000, limit, 3600000, 'default');

    expect(resA1.totalHits).toBe(1);
    expect(resA2.totalHits).toBe(2);
    expect(resA3.totalHits).toBe(3);
    expect(resA3.isBlocked).toBe(false);

    // Instance B gọi 2 lần (chạm ngưỡng 5)
    const resB1 = await instanceB.increment('user-shared-key', 3600000, limit, 3600000, 'default');
    const resB2 = await instanceB.increment('user-shared-key', 3600000, limit, 3600000, 'default');

    expect(resB1.totalHits).toBe(4);
    expect(resB2.totalHits).toBe(5);
    expect(resB2.isBlocked).toBe(false);

    // Instance B gọi lần thứ 6 -> vượt limit -> bị block
    const resB3 = await instanceB.increment('user-shared-key', 3600000, limit, 3600000, 'default');
    expect(resB3.totalHits).toBe(6);
    expect(resB3.isBlocked).toBe(true);

    // Instance A gọi tiếp -> cũng bị block trên cùng bộ đếm
    const resA4 = await instanceA.increment('user-shared-key', 3600000, limit, 3600000, 'default');
    expect(resA4.totalHits).toBe(7);
    expect(resA4.isBlocked).toBe(true);
  });
});
