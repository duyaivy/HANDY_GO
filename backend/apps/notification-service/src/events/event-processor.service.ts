import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/notification-client';
import { NotificationPrismaService } from '../common/notification-prisma.service.js';
import { NotificationsRepository } from '../notifications/notifications.repository.js';
import { PreferencesRepository } from '../preferences/preferences.repository.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { PushJobRepository } from '../push/push-job.repository.js';
import { PushPolicyResolver } from '../push/push-policy.resolver.js';
import {
  PermanentEventError,
  type NotificationEvent,
} from './event-contracts.js';
import { NotificationRouter } from './notification-router.js';
import { NotificationPolicy } from './notification-policy.js';
import { renderNotificationTemplate } from './notification-templates.js';

export interface ProcessingResult {
  status: 'processed' | 'duplicate' | 'skipped';
  recipientCount: number;
  notificationCount: number;
  pushJobCount?: number;
  skipReason?: string;
}

@Injectable()
export class EventProcessorService {
  constructor(
    private readonly db: NotificationPrismaService,
    private readonly notifications: NotificationsRepository,
    private readonly preferences: PreferencesRepository,
    private readonly router: NotificationRouter,
    private readonly policies: NotificationPolicy,
    @Optional() private readonly devices?: DevicesRepository,
    @Optional() private readonly pushJobs?: PushJobRepository,
    @Optional() private readonly pushPolicies?: PushPolicyResolver,
  ) {}

  process(event: NotificationEvent): Promise<ProcessingResult> {
    return this.db.$transaction(
      async (tx) => {
        // The unique insert serializes competing consumers. Rollback removes both
        // the inbox claim and all recipient effects; there is no partial fan-out.
        const claim = await tx.consumedEvent.createMany({
          data: [{ eventId: event.eventId, eventType: event.eventType }],
          skipDuplicates: true,
        });
        if (claim.count === 0) {
          const existing = await tx.consumedEvent.findUniqueOrThrow({
            where: { eventId: event.eventId },
          });
          if (existing.eventType !== event.eventType)
            throw new PermanentEventError('EVENT_ID_COLLISION');
          return {
            status: 'duplicate',
            recipientCount: 0,
            notificationCount: 0,
          };
        }
        const route = this.router.resolve(event);
        const { policy, skipReason } = this.policies.resolve(event);
        if (!policy || policy.mode === 'disabled') {
          return {
            status: 'skipped',
            recipientCount: route.recipients.length,
            notificationCount: 0,
            skipReason: skipReason ?? 'POLICY_DISABLED',
          };
        }
        if (event.eventType === 'wallet.debited') {
          const data = event.data as Record<string, unknown>;
          const isPaymentDebit =
            (data.reason &&
              ['PAYMENT', 'ORDER_PAYMENT', 'SERVICE_PAYMENT'].includes(
                String(data.reason).toUpperCase(),
              )) ||
            Boolean(data.paymentId) ||
            String(data.referenceType ?? '').toUpperCase() === 'PAYMENT';
          if (isPaymentDebit) {
            return {
              status: 'skipped',
              recipientCount: route.recipients.length,
              notificationCount: 0,
              skipReason: 'PAYMENT_DEBIT_SUPPRESSED',
            };
          }
        }

        const recipients = [
          ...new Map(
            route.recipients
              .filter((recipient) => policy.roles.includes(recipient.role))
              .map((recipient) => [recipient.userId, recipient]),
          ).values(),
        ];
        if (recipients.length === 0)
          throw new PermanentEventError('POLICY_RECIPIENT_MISMATCH');

        const recipientUserIds = recipients.map(({ userId }) => userId);

        const inAppOptOuts =
          policy.mode === 'optional'
            ? await this.preferences.findInAppOptOuts(tx, recipientUserIds)
            : new Set<string>();

        const pushDecision =
          this.pushPolicies && this.devices && this.pushJobs
            ? this.pushPolicies.resolve(event)
            : { enabled: false, mode: 'disabled' as const };

        const pushOptOuts =
          pushDecision.enabled && pushDecision.mode === 'optional'
            ? await this.preferences.findPushOptOuts(tx, recipientUserIds)
            : new Set<string>();

        const rows: Prisma.NotificationCreateManyInput[] = [];
        const userToNotificationId = new Map<string, string>();
        const pushEligibleUserIds: string[] = [];

        for (const { userId, role } of recipients) {
          const inAppEligible =
            policy.mode !== 'optional' || !inAppOptOuts.has(userId);
          const pushEligible =
            pushDecision.enabled &&
            (pushDecision.mode !== 'optional' || !pushOptOuts.has(userId));

          if (!inAppEligible && !pushEligible) continue;

          const notifId = randomUUID();
          userToNotificationId.set(userId, notifId);

          if (pushEligible) {
            pushEligibleUserIds.push(userId);
          }

          // Business deduplication: for matching events, key on request and worker to prevent duplicate alerts across runs
          const dedupeKey =
            event.eventType === 'matching.eligible_workers.ready' && route.requestId
              ? `new-request:${route.requestId}:${userId}`
              : `${event.eventId}:${userId}`;

          rows.push({
            id: notifId,
            recipientUserId: userId,
            sourceEventId: event.eventId,
            eventType: event.eventType,
            category: route.category,
            sourceService: event.source,
            sourceEntityId: route.entityId,
            serviceRequestId: route.requestId,
            dedupeKey,
            ...renderNotificationTemplate(
              event.eventType,
              role,
              policy.template,
            ),
            payload: {
              eventType: event.eventType,
              entityId: route.entityId,
              recipientRole: role,
              inAppVisible: inAppEligible,
              ...(route.requestId ? { requestId: route.requestId } : {}),
            },
            status: 'sent',
            readAt: null,
          });
        }

        const notificationCount = await this.notifications.createInAppBatch(
          tx,
          rows,
        );

        let pushJobCount = 0;
        if (
          notificationCount > 0 &&
          pushEligibleUserIds.length > 0 &&
          this.pushPolicies &&
          this.devices &&
          this.pushJobs
        ) {
          let activeUserToNotificationId = userToNotificationId;
          if (notificationCount < rows.length && tx.notification?.findMany) {
            const created = await tx.notification.findMany({
              where: { sourceEventId: event.eventId },
              select: { id: true, recipientUserId: true },
            });
            activeUserToNotificationId = new Map(
              created.map((c) => [c.recipientUserId, c.id]),
            );
          }

          const activeDevices = await this.devices.findActiveByUserIds(
            pushEligibleUserIds,
            tx,
          );
          const attempts = activeDevices
            .map((device) => {
              const notificationId = activeUserToNotificationId.get(device.userId);
              return notificationId
                ? { notificationId, deviceTokenId: device.id }
                : null;
            })
            .filter(
              (a): a is { notificationId: string; deviceTokenId: string } =>
                a !== null,
            );

          if (attempts.length > 0) {
            pushJobCount = await this.pushJobs.schedulePushAttempts(
              tx,
              attempts,
            );
          }
        }

        return {
          status: notificationCount ? 'processed' : 'skipped',
          recipientCount: recipients.length,
          notificationCount,
          pushJobCount,
          ...(notificationCount ? {} : { skipReason: 'IN_APP_DISABLED' }),
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}
