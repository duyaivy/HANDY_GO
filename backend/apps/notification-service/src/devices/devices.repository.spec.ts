import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevicesRepository } from './devices.repository.js';
import type { NotificationPrismaService } from '../common/notification-prisma.service.js';

describe('DevicesRepository (Rebind and Rotation Tests)', () => {
  let db: any;
  let tx: any;
  let repository: DevicesRepository;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      deviceToken: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      notificationDeliveryAttempt: {
        updateMany: vi.fn(),
      },
    };

    db = {
      $transaction: vi.fn(async (cb: (t: any) => Promise<any>) => cb(tx)),
      deviceToken: {
        updateMany: vi.fn(),
      },
    } as unknown as NotificationPrismaService;

    repository = new DevicesRepository(db);
  });

  it('atomically rebinds device when user B registers token previously owned by user A (R1 / F01)', async () => {
    const pushToken = 'fcm-token-shared-phone';
    const userA = 'user-a-1111-1111-1111-111111111111';
    const userB = 'user-b-2222-2222-2222-222222222222';

    // Existing token in DB owned by User A
    tx.deviceToken.findUnique
      .mockResolvedValueOnce({
        id: 'token-row-a',
        userId: userA,
        deviceId: 'install-shared',
        isActive: false, // User A logged out (or even if active)
      })
      .mockResolvedValueOnce(null); // User B has no existing row for (userId, deviceId)

    tx.deviceToken.create.mockResolvedValue({
      id: 'token-row-b',
      userId: userB,
      platform: 'android',
      deviceId: 'install-shared',
      pushToken,
      isActive: true,
    });

    const result = await repository.register(userB, {
      platform: 'android',
      deviceId: 'install-shared',
      pushToken,
    });

    // 1. Tombstone user A's token row and free up unique constraint
    expect(tx.deviceToken.update).toHaveBeenCalledWith({
      where: { id: 'token-row-a' },
      data: {
        isActive: false,
        pushToken: `${pushToken}:rebound:token-row-a`,
      },
    });

    // 2. Invalidate pending delivery attempts for User A
    expect(tx.notificationDeliveryAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        deviceTokenId: 'token-row-a',
        status: { in: ['queued', 'processing'] },
      },
      data: {
        status: 'failed',
        errorMessage: 'Device rebound to another user',
      },
    });

    // 3. User B gets fresh active device registration
    expect(tx.deviceToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: userB,
        pushToken,
        isActive: true,
      }),
      select: expect.anything(),
    });

    expect(result.id).toBe('token-row-b');
  });

  it('deactivateIfTokenMatches only deactivates if pushToken in DB matches the sent token (R7 / F07)', async () => {
    // When DB token was already rotated to T2, deactivating with old T1 affects 0 rows
    db.deviceToken.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.deactivateIfTokenMatches('dev-1', 'old-token-t1');

    expect(db.deviceToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'dev-1', pushToken: 'old-token-t1' },
      data: { isActive: false },
    });
    expect(result.count).toBe(0);
  });
});
