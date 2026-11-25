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

  it('schedules push notification even if recipient opted out of in-app (R3)', async () => {
    const fakeTx = {};
    const db = {
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fakeTx)),
    } as unknown as NotificationPrismaService;

    const notifications = {
      createInAppBatch: vi.fn().mockResolvedValue(1),
    } as unknown as NotificationsRepository;

    const event = eventFixture('order.created');
    const workerUserId = (event.data as any).workerId;

    // Recipient opted out of in-app, but push is enabled
    const preferences = {
      findInAppOptOuts: vi.fn().mockResolvedValue(new Set([workerUserId])),
      findPushOptOuts: vi.fn().mockResolvedValue(new Set()),
    } as unknown as PreferencesRepository;

    const router = new NotificationRouter();
    const policies = {
      resolve: vi.fn().mockReturnValue({
        policy: {
          mode: 'optional',
          roles: ['worker'],
        },
      }),
    } as unknown as NotificationPolicy;

    const devices = {
      findActiveByUserIds: vi.fn().mockResolvedValue([
        {
          id: 'dev-worker',
          userId: workerUserId,
          pushToken: 'push-token-worker',
        },
      ]),
    } as unknown as DevicesRepository;

    const pushJobs = {
      schedulePushAttempts: vi.fn().mockResolvedValue(1),
    } as unknown as PushJobRepository;

    const pushPolicies = {
      resolve: vi.fn().mockReturnValue({
        enabled: true,
        mode: 'optional',
      }),
    } as unknown as PushPolicyResolver;

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

    const result = await processor.process(event);

    expect(result.pushJobCount).toBe(1);
    expect(pushJobs.schedulePushAttempts).toHaveBeenCalledTimes(1);

    // Verify row created with inAppVisible: false
    const batchArgs = vi.mocked(notifications.createInAppBatch).mock.calls[0][1];
    expect(batchArgs[0].payload).toMatchObject({ inAppVisible: false });
  });

  it('uses business deduplication key for matching runs and skips push on duplicate run (R2)', async () => {
    const fakeTx = {};
    const db = {
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fakeTx)),
    } as unknown as NotificationPrismaService;

    // When dedupe key conflicts, createInAppBatch returns 0 inserted rows
    const notifications = {
      createInAppBatch: vi.fn().mockResolvedValue(0),
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
          roles: ['worker'],
        },
      }),
    } as unknown as NotificationPolicy;

    const devices = {
      findActiveByUserIds: vi.fn().mockResolvedValue([]),
    } as unknown as DevicesRepository;

    const pushJobs = {
      schedulePushAttempts: vi.fn().mockResolvedValue(0),
    } as unknown as PushJobRepository;

    const pushPolicies = {
      resolve: vi.fn().mockReturnValue({
        enabled: true,
        mode: 'mandatory',
      }),
    } as unknown as PushPolicyResolver;

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

    const event = eventFixture('matching.eligible_workers.ready');
    const result = await processor.process(event);

    // Verify business dedupeKey format
    const batchRows = vi.mocked(notifications.createInAppBatch).mock.calls[0][1];
    expect(batchRows[0].dedupeKey).toBe(
      `new-request:${(event.data as any).requestId}:${(event.data as any).eligibleWorkerIds[0]}`,
    );

    // Duplicate skipped -> no push scheduled
    expect(result.pushJobCount).toBe(0);
    expect(pushJobs.schedulePushAttempts).not.toHaveBeenCalled();
  });

  it('suppresses wallet.debited notification when debit is for a payment already covered by payment.succeeded (R4)', async () => {
    const fakeTx = {};
    const db = {
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fakeTx)),
    } as unknown as NotificationPrismaService;

    const notifications = {
      createInAppBatch: vi.fn(),
    } as unknown as NotificationsRepository;

    const preferences = {} as unknown as PreferencesRepository;
    const router = new NotificationRouter();
    const policies = {
      resolve: vi.fn().mockReturnValue({
        policy: {
          mode: 'mandatory',
          roles: ['owner'],
        },
      }),
    } as unknown as NotificationPolicy;

    (fakeTx as any).consumedEvent = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };

    const processor = new EventProcessorService(
      db,
      notifications,
      preferences,
      router,
      policies,
    );

    const event = eventFixture('wallet.debited');
    // Attach payment reference
    (event.data as any).reason = 'PAYMENT';
    (event.data as any).paymentId = '123e4567-e89b-12d3-a456-426614174000';

    const result = await processor.process(event);

    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBe('PAYMENT_DEBIT_SUPPRESSED');
    expect(notifications.createInAppBatch).not.toHaveBeenCalled();
  });

  it('enforces dedupeKey for worker.service_registration.approved and skips push jobs on duplicate event', async () => {
    const fakeTx = {};
    const db = {
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fakeTx)),
    } as unknown as NotificationPrismaService;

    // Simulate duplicate in-app insert: DB skips duplicate row and returns count: 0
    const notifications = {
      createInAppBatch: vi.fn().mockResolvedValue(0),
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
          roles: ['worker'],
        },
      }),
    } as unknown as NotificationPolicy;

    const devices = {
      findActiveByUserIds: vi.fn().mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'w-user-123',
          pushToken: 'push-token-1',
        },
      ]),
    } as unknown as DevicesRepository;

    const pushJobs = {
      schedulePushAttempts: vi.fn().mockResolvedValue(0),
    } as unknown as PushJobRepository;

    const pushPolicies = {
      resolve: vi.fn().mockReturnValue({
        enabled: true,
        mode: 'mandatory',
      }),
    } as unknown as PushPolicyResolver;

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

    const event = {
      eventId: '11111111-2222-3333-4444-555555555555',
      eventType: 'worker.service_registration.approved' as const,
      eventVersion: 1 as const,
      source: 'user-trust-service',
      occurredAt: new Date().toISOString(),
      data: {
        registrationId: 'reg-dedupe-1',
        userId: 'w-user-123',
        workerProfileId: 'wp-123',
        decision: 'approved',
      },
    };

    const result = await processor.process(event);

    // Verify dedupeKey format
    const batchRows = vi.mocked(notifications.createInAppBatch).mock.calls[0][1];
    expect(batchRows[0].dedupeKey).toBe(
      `worker.service_registration.approved:reg-dedupe-1:w-user-123`,
    );

    // Duplicate skipped -> notificationCount: 0 and NO push jobs scheduled
    expect(result.notificationCount).toBe(0);
    expect(result.pushJobCount).toBe(0);
    expect(pushJobs.schedulePushAttempts).not.toHaveBeenCalled();
  });
});
