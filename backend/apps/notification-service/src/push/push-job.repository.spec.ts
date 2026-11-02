import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushJobRepository } from './push-job.repository.js';
import type { NotificationPrismaService } from '../common/notification-prisma.service.js';

describe('PushJobRepository (Lease Fencing Tests - R8 / F09)', () => {
  let db: any;
  let repository: PushJobRepository;

  beforeEach(() => {
    db = {
      schema: 'notification_service',
      notificationDeliveryAttempt: {
        updateMany: vi.fn(),
      },
    } as unknown as NotificationPrismaService;

    repository = new PushJobRepository(db);
  });

  it('markJobSuccess updates status conditionally on status=processing and generation (R8 / F09)', async () => {
    const attemptTime = new Date('2026-10-25T10:00:00Z');
    db.notificationDeliveryAttempt.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.markJobSuccess('job-1', 'msg-fcm-1', attemptTime);

    expect(db.notificationDeliveryAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        status: 'processing',
        attemptedAt: attemptTime,
      },
      data: {
        status: 'sent',
        deliveredAt: expect.any(Date),
        provider: 'fcm',
        providerMessageId: 'msg-fcm-1',
        errorMessage: null,
      },
    });
    expect(result).toBe(true);
  });

  it('markJobFailed does not overwrite a job that is no longer in processing (e.g. already sent by another worker)', async () => {
    const oldAttemptTime = new Date('2026-10-25T09:00:00Z');
    // If worker B already completed and marked 'sent', matching rows count is 0
    db.notificationDeliveryAttempt.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.markJobFailed(
      'job-1',
      {
        attemptNo: 1,
        maxRetries: 3,
        isTransient: true,
        errorMessage: 'Slow transient failure from worker A',
      },
      oldAttemptTime,
    );

    expect(db.notificationDeliveryAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        status: 'processing',
        attemptedAt: oldAttemptTime,
      },
      data: expect.objectContaining({
        status: 'queued',
      }),
    });
    // Returns false because 0 rows were updated, preventing state corruption
    expect(result).toBe(false);
  });
});
