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
    createInAppBatch: vi.fn(),
  };
  const preferences = {
    findInAppOptOuts: vi.fn(),
    findPushOptOuts: vi.fn(),
  };
  const userTrustClient = {
    getAllActiveUserIds: vi.fn(),
  };
  const db = {
    $transaction: vi.fn((cb) => cb(db)),
  };
  const pushJobs = {
    schedulePushAttempts: vi.fn(),
  };
  const devices = {
    findActiveByUserIds: vi.fn(),
  };

  const service = new NotificationsService(
    repository as unknown as NotificationsRepository,
    preferences as any,
    userTrustClient as any,
    db as any,
    pushJobs as any,
    devices as any,
  );
  const userId = randomUUID();
  beforeEach(() => {
    vi.resetAllMocks();
    preferences.findPushOptOuts.mockResolvedValue(new Set());
    devices.findActiveByUserIds.mockResolvedValue([]);
  });

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

  describe('broadcast', () => {
    const adminId = randomUUID();
    const user1 = randomUUID();
    const user2 = randomUUID();
    const user3 = randomUUID();

    it('broadcasts to all active users from userTrustClient when recipientUserIds is omitted', async () => {
      userTrustClient.getAllActiveUserIds.mockResolvedValue([user1, user2, user3]);
      preferences.findInAppOptOuts.mockResolvedValue(new Set([user3])); // user3 opted out
      repository.createInAppBatch.mockResolvedValue(2);

      const result = await service.broadcast(adminId, {
        title: 'Bảo trì hệ thống',
        body: 'Thông báo bảo trì từ 2h-4h',
      });

      expect(userTrustClient.getAllActiveUserIds).toHaveBeenCalledWith(undefined);
      expect(preferences.findInAppOptOuts).toHaveBeenCalledWith(db, [user1, user2, user3]);
      expect(repository.createInAppBatch).toHaveBeenCalledTimes(1);

      const createdRows = repository.createInAppBatch.mock.calls[0][1];
      expect(createdRows).toHaveLength(2);
      expect(createdRows.map((r: any) => r.recipientUserId)).toEqual([user1, user2]);
      expect(createdRows[0].title).toBe('Bảo trì hệ thống');
      expect(createdRows[0].category).toBe('system');
      expect(createdRows[0].eventType).toBe('admin.broadcast');

      expect(result).toMatchObject({
        targetCount: 3,
        inAppCount: 2,
        pushJobCount: 0,
        skippedCount: 1,
      });
      expect(result.broadcastId).toBeDefined();
    });

    it('uses recipientUserIds directly without calling userTrustClient', async () => {
      preferences.findInAppOptOuts.mockResolvedValue(new Set());
      repository.createInAppBatch.mockResolvedValue(2);

      const result = await service.broadcast(adminId, {
        title: 'Chào mừng thành viên',
        body: 'Nội dung chào mừng',
        recipientUserIds: [user1, user2, user1], // with duplicates
      });

      expect(userTrustClient.getAllActiveUserIds).not.toHaveBeenCalled();
      expect(preferences.findInAppOptOuts).toHaveBeenCalledWith(db, [user1, user2]);
      expect(result).toMatchObject({
        targetCount: 2,
        inAppCount: 2,
        skippedCount: 0,
      });
    });

    it('returns 0s immediately when resolved user list is empty', async () => {
      userTrustClient.getAllActiveUserIds.mockResolvedValue([]);

      const result = await service.broadcast(adminId, {
        title: 'Tin nhắn',
        body: 'Nội dung',
      });

      expect(result).toMatchObject({
        targetCount: 0,
        inAppCount: 0,
        pushJobCount: 0,
        skippedCount: 0,
      });
      expect(repository.createInAppBatch).not.toHaveBeenCalled();
    });

    it('schedules push attempts when sendPush is true and active devices exist', async () => {
      userTrustClient.getAllActiveUserIds.mockResolvedValue([user1]);
      preferences.findInAppOptOuts.mockResolvedValue(new Set());
      preferences.findPushOptOuts.mockResolvedValue(new Set());
      repository.createInAppBatch.mockResolvedValue(1);
      devices.findActiveByUserIds.mockResolvedValue([
        { id: 'dev-1', userId: user1 },
      ]);
      pushJobs.schedulePushAttempts.mockResolvedValue(1);

      const result = await service.broadcast(adminId, {
        title: 'Khuyến mãi đặc biệt',
        body: 'Giảm giá 50%',
        sendPush: true,
      });

      expect(preferences.findPushOptOuts).toHaveBeenCalledWith(db, [user1]);
      expect(devices.findActiveByUserIds).toHaveBeenCalledWith([user1], db);
      expect(pushJobs.schedulePushAttempts).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        targetCount: 1,
        inAppCount: 1,
        pushJobCount: 1,
        skippedCount: 0,
      });
    });

    it('populates event payload, inferred category, and default template when eventType is order.created', async () => {
      userTrustClient.getAllActiveUserIds.mockResolvedValue([user1]);
      preferences.findInAppOptOuts.mockResolvedValue(new Set());
      repository.createInAppBatch.mockResolvedValue(1);

      const result = await service.broadcast(adminId, {
        eventType: 'order.created',
        targetGroup: 'CUSTOMERS',
        sendPush: false,
      });

      expect(result.inAppCount).toBe(1);
      const createdRows = repository.createInAppBatch.mock.calls[0][1];
      expect(createdRows[0].eventType).toBe('order.created');
      expect(createdRows[0].category).toBe('order');
      expect(createdRows[0].title).toBe('Đơn hàng đã được xác nhận');
      expect(createdRows[0].body).toBe('Đơn hàng của bạn đã được tạo thành công.');
      expect(createdRows[0].sourceEntityId).toBeTruthy();
      expect(createdRows[0].serviceRequestId).toBeTruthy();
      expect(createdRows[0].payload).toMatchObject({
        eventType: 'order.created',
        recipientRole: 'customer',
        status: 'CONFIRMED',
        orderId: createdRows[0].sourceEntityId,
        requestId: createdRows[0].serviceRequestId,
      });
    });

    it('bypasses push scheduling when sendPush is explicitly false', async () => {
      userTrustClient.getAllActiveUserIds.mockResolvedValue([user1]);
      preferences.findInAppOptOuts.mockResolvedValue(new Set());
      repository.createInAppBatch.mockResolvedValue(1);

      const result = await service.broadcast(adminId, {
        title: 'Chỉ thông báo in-app',
        body: 'Không gửi push',
        sendPush: false,
      });

      expect(preferences.findPushOptOuts).not.toHaveBeenCalled();
      expect(devices.findActiveByUserIds).not.toHaveBeenCalled();
      expect(pushJobs.schedulePushAttempts).not.toHaveBeenCalled();
      expect(result.pushJobCount).toBe(0);
    });
  });
});
