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
    storage = new PostgresThrottlerStorage(
      dbMock as unknown as AuthPrismaService,
    );
  });

  it('chèn bản ghi mới và trả về totalHits = 1 khi key chưa tồn tại', async () => {
    const expireAt = new Date(Date.now() + 3600000);
    dbMock.$queryRaw.mockResolvedValueOnce([{ points: 1, expireAt }]);

    const result = await storage.increment(
      'test-key',
      3600000,
      5,
      3600000,
      'default',
    );

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToExpire).toBeGreaterThan(0);
    expect(dbMock.$queryRaw).toHaveBeenCalledOnce();
  });

  it('tăng points và đánh dấu isBlocked = false khi chưa vượt quá limit', async () => {
    const expireAt = new Date(Date.now() + 3600000);
    dbMock.$queryRaw.mockResolvedValueOnce([{ points: 3, expireAt }]);

    const result = await storage.increment(
      'test-key',
      3600000,
      5,
      3600000,
      'default',
    );

    expect(result.totalHits).toBe(3);
    expect(result.isBlocked).toBe(false);
  });

  it('đánh dấu isBlocked = true khi points vượt quá limit', async () => {
    const expireAt = new Date(Date.now() + 3600000);
    dbMock.$queryRaw.mockResolvedValueOnce([{ points: 6, expireAt }]);

    const result = await storage.increment(
      'test-key',
      3600000,
      5,
      3600000,
      'default',
    );

    expect(result.totalHits).toBe(6);
    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBeGreaterThan(0);
  });
});
