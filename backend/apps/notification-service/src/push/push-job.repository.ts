import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/notification-client';
import { NotificationPrismaService } from '../common/notification-prisma.service.js';
import { PUSH_DEFAULTS } from './push.constants.js';

export interface PushJobWithRelations {
  id: string;
  notificationId: string;
  deviceTokenId: string | null;
  attemptNo: number;
  deliveryAttemptKey: string;
  status: string;
  notification: {
    id: string;
    title: string;
    body: string;
    eventType: string;
    category: string;
    sourceEntityId: string | null;
    serviceRequestId: string | null;
    payload: Prisma.JsonValue;
  };
  deviceToken: {
    id: string;
    userId: string;
    pushToken: string;
    isActive: boolean;
  } | null;
}

export interface MarkJobFailedOptions {
  attemptNo: number;
  maxRetries: number;
  isTransient: boolean;
  errorMessage?: string;
}

@Injectable()
export class PushJobRepository {
  constructor(private readonly db: NotificationPrismaService) {}

  /**
   * Concurrently claims a batch of queued push delivery attempts using FOR UPDATE SKIP LOCKED.
   */
  async claimPendingJobs(batchSize: number): Promise<PushJobWithRelations[]> {
    const claimed = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "notification_service"."notification_delivery_attempts"
      SET status = 'processing'::"notification_service"."delivery_status", attempted_at = NOW()
      WHERE id IN (
        SELECT id FROM "notification_service"."notification_delivery_attempts"
        WHERE channel = 'push'::"notification_service"."notification_channel"
          AND status = 'queued'::"notification_service"."delivery_status"
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;

    if (claimed.length === 0) {
      return [];
    }

    const jobIds = claimed.map((c) => c.id);
    return this.db.notificationDeliveryAttempt.findMany({
      where: { id: { in: jobIds } },
      include: {
        notification: {
          select: {
            id: true,
            title: true,
            body: true,
            eventType: true,
            category: true,
            sourceEntityId: true,
            serviceRequestId: true,
            payload: true,
          },
        },
        deviceToken: {
          select: {
            id: true,
            userId: true,
            pushToken: true,
            isActive: true,
          },
        },
      },
    }) as unknown as Promise<PushJobWithRelations[]>;
  }

  /**
   * Reclaims jobs stuck in 'processing' beyond the lease timeout (e.g. following process crashes).
   */
  async reclaimAbandonedJobs(leaseTimeoutMs: number): Promise<number> {
    const thresholdDate = new Date(Date.now() - leaseTimeoutMs);
    const result = await this.db.notificationDeliveryAttempt.updateMany({
      where: {
        channel: 'push',
        status: 'processing',
        attemptedAt: { lte: thresholdDate },
      },
      data: {
        status: 'queued',
      },
    });
    return result.count;
  }

  /**
   * Marks a job as successfully sent via FCM.
   */
  async markJobSuccess(id: string, providerMessageId: string): Promise<void> {
    await this.db.notificationDeliveryAttempt.update({
      where: { id },
      data: {
        status: 'sent',
        deliveredAt: new Date(),
        provider: 'fcm',
        providerMessageId,
        errorMessage: null,
      },
    });
  }

  /**
   * Marks a job as failed, scheduling retry if transient or setting terminal failed status.
   */
  async markJobFailed(
    id: string,
    options: MarkJobFailedOptions,
  ): Promise<void> {
    const { attemptNo, maxRetries, isTransient, errorMessage } = options;

    if (isTransient && attemptNo < maxRetries) {
      // Exponential backoff with jitter
      const exponentialDelay =
        PUSH_DEFAULTS.RETRY_BASE_DELAY_MS * Math.pow(2, attemptNo - 1);
      const jitter = Math.floor(Math.random() * 1000);
      const delayMs = Math.min(
        exponentialDelay + jitter,
        PUSH_DEFAULTS.RETRY_MAX_DELAY_MS,
      );
      const nextRetryAt = new Date(Date.now() + delayMs);

      await this.db.notificationDeliveryAttempt.update({
        where: { id },
        data: {
          status: 'queued',
          attemptNo: attemptNo + 1,
          nextRetryAt,
          errorMessage: errorMessage ?? 'Transient push failure; retrying',
          provider: 'fcm',
        },
      });
    } else {
      // Terminal failure
      await this.db.notificationDeliveryAttempt.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: errorMessage ?? 'Push delivery permanently failed',
          provider: 'fcm',
        },
      });
    }
  }

  /**
   * Schedules push delivery attempts within an existing transaction.
   */
  async schedulePushAttempts(
    tx: Prisma.TransactionClient,
    attempts: Array<{
      notificationId: string;
      deviceTokenId: string;
    }>,
  ): Promise<number> {
    if (attempts.length === 0) return 0;

    const data: Prisma.NotificationDeliveryAttemptCreateManyInput[] = attempts.map(
      (a) => ({
        notificationId: a.notificationId,
        deviceTokenId: a.deviceTokenId,
        channel: 'push',
        deliveryAttemptKey: `push:${a.notificationId}:${a.deviceTokenId}`,
        status: 'queued',
        attemptNo: 1,
        provider: 'fcm',
      }),
    );

    const result = await tx.notificationDeliveryAttempt.createMany({
      data,
      skipDuplicates: true,
    });
    return result.count;
  }
}
