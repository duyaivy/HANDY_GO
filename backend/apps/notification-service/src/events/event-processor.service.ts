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
        const recipients = [
          ...new Map(
            route.recipients
              .filter((recipient) => policy.roles.includes(recipient.role))
              .map((recipient) => [recipient.userId, recipient]),
          ).values(),
        ];
        if (recipients.length === 0)
          throw new PermanentEventError('POLICY_RECIPIENT_MISMATCH');
        const optedOut =
          policy.mode === 'optional'
            ? await this.preferences.findInAppOptOuts(
                tx,
                recipients.map(({ userId }) => userId),
              )
            : new Set<string>();

        const rows: Prisma.NotificationCreateManyInput[] = [];
        const userToNotificationId = new Map<string, string>();

        for (const { userId, role } of recipients) {
          if (!optedOut.has(userId)) {
            const notifId = randomUUID();
            userToNotificationId.set(userId, notifId);
            rows.push({
              id: notifId,
              recipientUserId: userId,
              sourceEventId: event.eventId,
              eventType: event.eventType,
              category: route.category,
              sourceService: event.source,
              sourceEntityId: route.entityId,
              serviceRequestId: route.requestId,
              // Event-level only: do not merge unrelated payments/runs/ledger entries.
              dedupeKey: `${event.eventId}:${userId}`,
              ...renderNotificationTemplate(
                event.eventType,
                role,
                policy.template,
              ),
              payload: {
                eventType: event.eventType,
                entityId: route.entityId,
                recipientRole: role,
                ...(route.requestId ? { requestId: route.requestId } : {}),
              },
              status: 'sent',
              readAt: null,
            });
          }
        }

        const notificationCount = await this.notifications.createInAppBatch(
          tx,
          rows,
        );

        let pushJobCount = 0;
        if (
          this.pushPolicies &&
          this.devices &&
          this.pushJobs &&
          userToNotificationId.size > 0
        ) {
          const pushDecision = this.pushPolicies.resolve(event);
          if (pushDecision.enabled) {
            const recipientIds = Array.from(userToNotificationId.keys());
            const pushOptOuts =
              pushDecision.mode === 'optional'
                ? await this.preferences.findPushOptOuts(tx, recipientIds)
                : new Set<string>();

            const eligibleUserIds = recipientIds.filter(
              (userId) => !pushOptOuts.has(userId),
            );

            if (eligibleUserIds.length > 0) {
              const activeDevices = await this.devices.findActiveByUserIds(
                eligibleUserIds,
                tx,
              );
              const attempts = activeDevices
                .map((device) => {
                  const notificationId = userToNotificationId.get(device.userId);
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
