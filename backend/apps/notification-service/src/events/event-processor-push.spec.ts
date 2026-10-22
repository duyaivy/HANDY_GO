import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { EventProcessorService } from './event-processor.service.js';
import { NotificationRouter } from './notification-router.js';
import { NotificationPolicy } from './notification-policy.js';
import type { NotificationPrismaService } from '../common/notification-prisma.service.js';
import type { NotificationsRepository } from '../notifications/notifications.repository.js';
import type { PreferencesRepository } from '../preferences/preferences.repository.js';
import type { DevicesRepository } from '../devices/devices.repository.js';
import type { PushJobRepository } from '../push/push-job.repository.js';
import type { PushPolicyResolver } from '../push/push-policy.resolver.js';
import { eventFixture } from '../../test/event-fixtures.js';

describe('EventProcessorService Push Scheduling', () => {
  it('schedules push delivery attempts for eligible recipients and active devices', async () => {
    const fakeTx = {};
    const db = {
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fakeTx)),
    } as unknown as NotificationPrismaService;

    const notifications = {
      createInAppBatch: vi.fn().mockResolvedValue(1),
    } as unknown as NotificationsRepository;

    const preferences = {
      findInAppOptOuts: vi.fn().mockResolvedValue(new Set()),
      findPushOptOuts: vi.fn().mockResolvedValue(new Set()),
    } as unknown as PreferencesRepository;

    const router = new NotificationRouter();
    const policies = {
      resolve: vi.fn().mockReturnValue({
        policy: {
          mode: 'mandatory',
          roles: ['customer', 'worker', 'payer', 'recipient', 'owner'],
        },
      }),
    } as unknown as NotificationPolicy;

    const devices = {
      findActiveByUserIds: vi.fn().mockImplementation((userIds: string[]) =>
        Promise.resolve([
          {
            id: 'dev-1',
            userId: userIds[0],
            pushToken: 'push-token-1',
          },
        ]),
      ),
    } as unknown as DevicesRepository;

    const pushJobs = {
      schedulePushAttempts: vi.fn().mockResolvedValue(1),
    } as unknown as PushJobRepository;

    const pushPolicies = {
      resolve: vi.fn().mockReturnValue({
        enabled: true,
        mode: 'mandatory',
      }),
    } as unknown as PushPolicyResolver;

    // Mock consumedEvent inbox check inside tx
    (fakeTx as any).consumedEvent = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };

    const processor = new EventProcessorService(
      db,
      notifications,
      preferences,
      router,
      policies,
      devices,
      pushJobs,
      pushPolicies,
    );

    const event = eventFixture('order.created');
    const result = await processor.process(event);

    expect(result.status).toBe('processed');
    expect(result.notificationCount).toBe(1);
    expect(result.pushJobCount).toBe(1);
    expect(pushJobs.schedulePushAttempts).toHaveBeenCalledWith(
      fakeTx,
      expect.arrayContaining([
        expect.objectContaining({
          deviceTokenId: 'dev-1',
          notificationId: expect.any(String),
        }),
      ]),
    );
  });
});
