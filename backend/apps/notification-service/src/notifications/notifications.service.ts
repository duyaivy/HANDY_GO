import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationCategory, type Prisma } from '@prisma/notification-client';
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

    return this.db.$transaction(
      async (tx) => {
        // 2. Lọc bỏ người dùng đã tắt in-app notification
        const optOuts = await this.preferences.findInAppOptOuts(tx, userIds);
        const targetUserIds = userIds.filter((id) => !optOuts.has(id));

        const rows: Prisma.NotificationCreateManyInput[] = targetUserIds.map(
          (userId) => ({
            id: randomUUID(),
            recipientUserId: userId,
            sourceEventId: broadcastEventId,
            eventType: 'admin.broadcast',
            category: dto.category ?? NotificationCategory.system,
            sourceService: 'notification-service',
            sourceEntityId: null,
            serviceRequestId: null,
            dedupeKey: `broadcast:${broadcastEventId}:${userId}`,
            title: dto.title,
            body: dto.body,
            payload: {
              eventType: 'admin.broadcast',
              senderAdminId: adminUserId,
              targetGroup: dto.targetGroup ?? 'ALL',
              ...dto.payload,
            },
            status: 'sent',
            readAt: null,
          }),
        );

        const inAppCount =
          rows.length > 0
            ? await this.repository.createInAppBatch(tx, rows)
            : 0;

        // 3. Tùy chọn gửi kèm push notification
        let pushJobCount = 0;
        if (dto.sendPush && this.pushJobs && this.devices && rows.length > 0) {
          const pushOptOuts = await this.preferences.findPushOptOuts(
            tx,
            targetUserIds,
          );
          const eligiblePushUserIds = targetUserIds.filter(
            (id) => !pushOptOuts.has(id),
          );

          if (eligiblePushUserIds.length > 0) {
            const activeDevices = await this.devices.findActiveByUserIds(
              eligiblePushUserIds,
              tx,
            );
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
