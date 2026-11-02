import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@app/config';
import { PushWorkerService } from './push-worker.service.js';
import type { PushJobRepository, PushJobWithRelations } from './push-job.repository.js';
import type { DevicesRepository } from '../devices/devices.repository.js';
import type { PushProvider } from './push-provider.js';

describe('PushWorkerService', () => {
  let config: ConfigService;
  let pushJobs: PushJobRepository;
  let devices: DevicesRepository;
  let provider: PushProvider;
  let worker: PushWorkerService;

  beforeEach(() => {
    config = {
      get: vi.fn((key: string) => {
        if (key === 'PUSH_ENABLED') return 'true';
        if (key === 'PUSH_WORKER_ENABLED') return 'true';
        if (key === 'PUSH_WORKER_BATCH_SIZE') return '10';
        if (key === 'PUSH_MAX_RETRY_ATTEMPTS') return '3';
        return undefined;
      }),
    } as unknown as ConfigService;

    pushJobs = {
      claimPendingJobs: vi.fn(),
      reclaimAbandonedJobs: vi.fn(),
      markJobSuccess: vi.fn(),
      markJobFailed: vi.fn(),
      schedulePushAttempts: vi.fn(),
    } as unknown as PushJobRepository;

    devices = {
      deactivateById: vi.fn(),
      deactivateIfTokenMatches: vi.fn(),
    } as unknown as DevicesRepository;

    provider = {
      sendEach: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as PushProvider;

    worker = new PushWorkerService(config, pushJobs, devices, provider);
  });

  it('marks job permanently failed if device token is missing or inactive', async () => {
    const inactiveJob: PushJobWithRelations = {
      id: 'job-1',
      notificationId: 'notif-1',
      deviceTokenId: 'dev-1',
      attemptNo: 1,
      deliveryAttemptKey: 'push:notif-1:dev-1',
      status: 'processing',
      attemptedAt: null,
      notification: {
        id: 'notif-1',
        recipientUserId: 'user-1',
        title: 'Title',
        body: 'Body',
        eventType: 'order.created',
        category: 'order',
        sourceEntityId: null,
        serviceRequestId: null,
        payload: null,
      },
      deviceToken: {
        id: 'dev-1',
        userId: 'user-1',
        pushToken: 'fcm-token',
        isActive: false, // inactive!
      },
    };

    await worker.processJobs([inactiveJob]);

    expect(pushJobs.markJobFailed).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        attemptNo: 1,
        maxRetries: 1,
        isTransient: false,
        errorMessage: expect.stringContaining('deactivated'),
      }),
      null,
    );
    expect(provider.sendEach).not.toHaveBeenCalled();
  });

  it('marks job permanently failed if device token ownership does not match notification recipient', async () => {
    const mismatchedJob: PushJobWithRelations = {
      id: 'job-mismatch',
      notificationId: 'notif-mismatch',
      deviceTokenId: 'dev-rebound',
      attemptNo: 1,
      deliveryAttemptKey: 'push:notif-mismatch:dev-rebound',
      status: 'processing',
      attemptedAt: null,
      notification: {
        id: 'notif-mismatch',
        recipientUserId: 'user-original-owner',
        title: 'Private info',
        body: 'Secret body',
        eventType: 'payment.succeeded',
        category: 'payment',
        sourceEntityId: 'order-1',
        serviceRequestId: null,
        payload: null,
      },
      deviceToken: {
        id: 'dev-rebound',
        userId: 'user-new-rebound-owner', // Ownership changed!
        pushToken: 'fcm-token-shared-device',
        isActive: true,
      },
    };

    await worker.processJobs([mismatchedJob]);

    expect(pushJobs.markJobFailed).toHaveBeenCalledWith(
      'job-mismatch',
      expect.objectContaining({
        isTransient: false,
        errorMessage: expect.stringContaining('ownership mismatch'),
      }),
      null,
    );
    expect(provider.sendEach).not.toHaveBeenCalled();
  });

  it('processes valid jobs, sends to provider, and marks success', async () => {
    const validJob: PushJobWithRelations = {
      id: 'job-2',
      notificationId: 'notif-2',
      deviceTokenId: 'dev-2',
      attemptNo: 1,
      deliveryAttemptKey: 'push:notif-2:dev-2',
      status: 'processing',
      attemptedAt: null,
      notification: {
        id: 'notif-2',
        recipientUserId: 'user-2',
        title: 'Thành công',
        body: 'Nội dung',
        eventType: 'payment.succeeded',
        category: 'payment',
        sourceEntityId: 'order-1',
        serviceRequestId: null,
        payload: { recipientRole: 'customer' },
      },
      deviceToken: {
        id: 'dev-2',
        userId: 'user-2',
        pushToken: 'valid-fcm-token',
        isActive: true,
      },
    };

    vi.mocked(provider.sendEach).mockResolvedValue([
      {
        jobId: 'job-2',
        token: 'valid-fcm-token',
        success: true,
        messageId: 'fcm-msg-id-123',
        shouldDeactivateToken: false,
        isTransient: false,
      },
    ]);

    await worker.processJobs([validJob]);

    expect(provider.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({
        jobId: 'job-2',
        token: 'valid-fcm-token',
        title: 'Thành công',
        body: 'Nội dung',
      }),
    ]);
    expect(pushJobs.markJobSuccess).toHaveBeenCalledWith('job-2', 'fcm-msg-id-123', null);
  });

  it('handles invalid token by deactivating device conditionally and marking job failed', async () => {
    const jobWithDeadToken: PushJobWithRelations = {
      id: 'job-3',
      notificationId: 'notif-3',
      deviceTokenId: 'dev-3',
      attemptNo: 1,
      deliveryAttemptKey: 'push:notif-3:dev-3',
      status: 'processing',
      attemptedAt: null,
      notification: {
        id: 'notif-3',
        recipientUserId: 'user-3',
        title: 'Title',
        body: 'Body',
        eventType: 'order.created',
        category: 'order',
        sourceEntityId: null,
        serviceRequestId: null,
        payload: null,
      },
      deviceToken: {
        id: 'dev-3',
        userId: 'user-3',
        pushToken: 'dead-token',
        isActive: true,
      },
    };

    vi.mocked(provider.sendEach).mockResolvedValue([
      {
        jobId: 'job-3',
        token: 'dead-token',
        success: false,
        errorCode: 'messaging/registration-token-not-registered',
        errorMessage: 'Token is dead',
        shouldDeactivateToken: true,
        isTransient: false,
      },
    ]);

    await worker.processJobs([jobWithDeadToken]);

    expect(pushJobs.markJobFailed).toHaveBeenCalledWith(
      'job-3',
      expect.objectContaining({
        attemptNo: 1,
        maxRetries: 3,
        isTransient: false,
        errorMessage: 'Token is dead',
      }),
      null,
    );
    expect(devices.deactivateIfTokenMatches).toHaveBeenCalledWith('dev-3', 'dead-token');
  });
});
