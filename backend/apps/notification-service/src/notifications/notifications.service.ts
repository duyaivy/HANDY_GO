import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/notification-client';
import { NotificationPrismaService } from '../common/notification-prisma.service.js';
import { PreferencesRepository } from '../preferences/preferences.repository.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { PushJobRepository } from '../push/push-job.repository.js';
import { UserTrustRpcClient } from '../common/rpc/user-trust-rpc.client.js';
import { NotificationsRepository } from './notifications.repository.js';
import type { ListNotificationsDto } from './dto/list-notifications.dto.js';
import type {
  AdminBroadcastNotificationDto,
  BroadcastResponseDto,
} from './dto/broadcast-notification.dto.js';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor.js';
import {
  resolveEventCategory,
  resolveEventTitleAndBody,
  generateMockEventPayload,
} from './notification-test-event.js';
import type { RecipientRole } from '../events/notification-templates.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly preferences: PreferencesRepository,
    private readonly userTrustClient: UserTrustRpcClient,
    private readonly db: NotificationPrismaService,
    @Optional() private readonly pushJobs?: PushJobRepository,
    @Optional() private readonly devices?: DevicesRepository,
  ) {}

  async list(userId: string, query: ListNotificationsDto) {
    const cursor = query.cursor
      ? decodeNotificationCursor(query.cursor, userId, query.isRead)
      : undefined;
    const rows = await this.repository.list(
      userId,
      query.limit,
      query.isRead,
      cursor,
    );
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: hasMore
        ? encodeNotificationCursor(
            items[items.length - 1],
            userId,
            query.isRead,
          )
        : null,
    };
  }

  async unreadCount(userId: string) {
    return { count: await this.repository.unreadCount(userId) };
  }

  async findOne(userId: string, id: string) {
    const row = await this.repository.findOne(userId, id);
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  async markRead(userId: string, id: string) {
    const row = await this.repository.markRead(userId, id);
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  async markAllRead(userId: string) {
    const { count } = await this.repository.markAllRead(userId);
    return { updatedCount: count };
  }

  async broadcast(
    adminUserId: string,
    dto: AdminBroadcastNotificationDto,
  ): Promise<BroadcastResponseDto> {
    // 1. Xác định danh sách recipientUserIds
    let userIds: string[];
    if (dto.recipientUserIds && dto.recipientUserIds.length > 0) {
      userIds = Array.from(new Set(dto.recipientUserIds));
    } else {
      userIds = await this.userTrustClient.getAllActiveUserIds(dto.targetGroup);
    }

    if (userIds.length === 0) {
      return {
        broadcastId: randomUUID(),
        targetCount: 0,
        inAppCount: 0,
        pushJobCount: 0,
        skippedCount: 0,
      };
    }

    const broadcastEventId = randomUUID();
    const effectiveEventType = dto.eventType?.trim() || 'admin.broadcast';
    const effectiveCategory = resolveEventCategory(
      effectiveEventType,
      dto.category,
    );

    let effectiveEntityId = dto.entityId ?? null;
    if (!effectiveEntityId) {
      if (
        effectiveEventType.startsWith('order.') ||
        effectiveEventType.startsWith('bid.') ||
        effectiveEventType.startsWith('booking_proposal.') ||
        effectiveEventType.startsWith('payment.') ||
        effectiveEventType.startsWith('wallet.')
      ) {
        effectiveEntityId = randomUUID();
      }
    }

    let effectiveRequestId = dto.requestId ?? null;
    if (!effectiveRequestId) {
      if (
        effectiveEventType.startsWith('order.') ||
        effectiveEventType.startsWith('bid.') ||
        effectiveEventType.startsWith('booking_proposal.') ||
        effectiveEventType.startsWith('matching.')
      ) {
        effectiveRequestId = randomUUID();
      }
    }

    if (effectiveEventType.startsWith('matching.') && !effectiveEntityId) {
      effectiveEntityId = effectiveRequestId;
    }

    return this.db.$transaction(
      async (tx) => {
        // 2. Phân loại theo từng kênh độc lập (in-app và push)
        const inAppOptOuts = await this.preferences.findInAppOptOuts(
          tx,
          userIds,
        );
        const shouldSendPush = dto.sendPush !== false;
        const pushOptOuts =
          shouldSendPush && this.pushJobs && this.devices
            ? ((await this.preferences.findPushOptOuts(tx, userIds)) ??
              new Set<string>())
            : new Set<string>();

        const potentiallyPushEligible =
          shouldSendPush && this.devices && this.pushJobs
            ? userIds.filter((id) => !pushOptOuts.has(id))
            : [];

        const activeDevices =
          potentiallyPushEligible.length > 0 && this.devices
            ? ((await this.devices.findActiveByUserIds(
                potentiallyPushEligible,
                tx,
              )) ?? [])
            : [];
        const usersWithActiveDevices = new Set(
          activeDevices.map((d) => d.userId),
        );

        const rows: Prisma.NotificationCreateManyInput[] = [];

        for (const userId of userIds) {
          const inAppEligible = !inAppOptOuts.has(userId);
          const pushEligible = usersWithActiveDevices.has(userId);

          if (!inAppEligible && !pushEligible) continue;

          let role: RecipientRole = 'customer';
          if (dto.targetGroup === 'WORKERS') {
            role = 'worker';
          } else if (dto.targetGroup === 'CUSTOMERS') {
            role = 'customer';
          } else if (
            effectiveEventType === 'matching.eligible_workers.ready' ||
            effectiveEventType === 'booking_proposal.created'
          ) {
            role = 'worker';
          } else if (effectiveEventType.startsWith('payment.')) {
            role =
              effectiveEventType === 'payment.refunded' ? 'recipient' : 'payer';
          } else if (effectiveEventType.startsWith('wallet.')) {
            role = 'owner';
          }

          const { title, body } = resolveEventTitleAndBody({
            eventType: effectiveEventType,
            role,
            explicitTitle: dto.title,
            explicitBody: dto.body,
          });

          const eventPayload = generateMockEventPayload({
            eventType: effectiveEventType,
            entityId: effectiveEntityId,
            requestId: effectiveRequestId,
            recipientUserId: userId,
            role,
          });

          const mergedPayload: Record<string, unknown> = {
            eventType: effectiveEventType,
            senderAdminId: adminUserId,
            targetGroup: dto.targetGroup ?? 'ALL',
            recipientRole: role,
            inAppVisible: inAppEligible,
            ...(effectiveEntityId ? { entityId: effectiveEntityId } : {}),
            ...(effectiveRequestId ? { requestId: effectiveRequestId } : {}),
            ...eventPayload,
            ...dto.payload,
          };

          rows.push({
            id: randomUUID(),
            recipientUserId: userId,
            sourceEventId: broadcastEventId,
            eventType: effectiveEventType,
            category: effectiveCategory,
            sourceService: 'notification-service',
            sourceEntityId: effectiveEntityId,
            serviceRequestId: effectiveRequestId,
            dedupeKey: `broadcast:${broadcastEventId}:${userId}`,
            title,
            body,
            payload: mergedPayload as Prisma.InputJsonValue,
            status: 'sent',
            readAt: null,
          });
        }

        if (rows.length > 0) await this.repository.createInAppBatch(tx, rows);

        const inAppCount = rows.filter(
          (r) => (r.payload as Record<string, unknown>)?.inAppVisible !== false,
        ).length;

        // 3. Tùy chọn gửi kèm push notification (mặc định bật)
        let pushJobCount = 0;
        if (
          shouldSendPush &&
          this.pushJobs &&
          this.devices &&
          rows.length > 0 &&
          activeDevices.length > 0
        ) {
          const userToNotificationId = new Map(
            rows.map((r) => [r.recipientUserId, r.id]),
          );
          const attempts = activeDevices
            .map((device) => {
              const notifId = userToNotificationId.get(device.userId);
              return notifId
                ? { notificationId: notifId, deviceTokenId: device.id }
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
          broadcastId: broadcastEventId,
          targetCount: userIds.length,
          inAppCount,
          pushJobCount,
          skippedCount: userIds.length - inAppCount,
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
}
