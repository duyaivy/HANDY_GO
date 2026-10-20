import { randomUUID } from 'node:crypto';
import { NotificationsService } from './notifications.service.js';
import type { NotificationsRepository } from './notifications.repository.js';
import { encodeNotificationCursor } from './notification-cursor.js';

describe('NotificationsService', () => {
  const repository = {
    list: vi.fn(),
    unreadCount: vi.fn(),
    findOne: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  };
  const service = new NotificationsService(
    repository as unknown as NotificationsRepository,
  );
  const userId = randomUUID();
  beforeEach(() => vi.resetAllMocks());

  it('returns a bounded page and a continuation, then terminates on the last page', async () => {
    const rows = [1, 2, 3].map(() => ({
      id: randomUUID(),
      createdAt: new Date(),
    }));
    repository.list
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([rows[2]]);
    const first = await service.list(userId, { limit: 2 });
    expect(first.items).toEqual(rows.slice(0, 2));
    expect(first.nextCursor).toBeTruthy();
    const last = await service.list(userId, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(last).toEqual({ items: [rows[2]], nextCursor: null });
    expect(repository.list).toHaveBeenLastCalledWith(
      userId,
      2,
      undefined,
      rows[1],
    );
  });

  it('rejects malformed, foreign-user and different-filter cursors before querying', async () => {
    const row = { id: randomUUID(), createdAt: new Date() };
    for (const cursor of [
      '%%%bad',
      Buffer.from('null').toString('base64url'),
      encodeNotificationCursor(row, randomUUID()),
      encodeNotificationCursor(row, userId, false),
    ]) {
      await expect(
        service.list(userId, { limit: 20, cursor }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('returns an empty final page without a cursor', async () => {
    repository.list.mockResolvedValue([]);
    expect(await service.list(userId, { limit: 20 })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('does not mark reads when fetching details', async () => {
    repository.findOne.mockResolvedValue({ id: 'id', readAt: null });
    expect(await service.findOne(userId, 'id')).toMatchObject({ readAt: null });
    expect(repository.markRead).not.toHaveBeenCalled();
  });

  it.each(['findOne', 'markRead'] as const)(
    'hides missing or other-user notifications on %s',
    async (method) => {
      repository[method].mockResolvedValue(null);
      await expect(service[method](userId, randomUUID())).rejects.toMatchObject(
        { status: 404 },
      );
    },
  );

  it('exposes bulk-update counts, including idempotent zero', async () => {
    repository.markAllRead
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 0 });
    expect(await service.markAllRead(userId)).toEqual({ updatedCount: 4 });
    expect(await service.markAllRead(userId)).toEqual({ updatedCount: 0 });
    expect(repository.markAllRead).toHaveBeenCalledWith(userId);
  });
});
