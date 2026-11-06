import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/notification-client';
import { NotificationPrismaService } from '../common/notification-prisma.service.js';

const notificationSelect = {
  id: true,
  category: true,
  title: true,
  body: true,
  payload: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationSelect;

// Missing/NULL visibility is a legacy in-app notification. PostgreSQL JSON path
// comparisons alone yield UNKNOWN for missing keys, so NOT(false) drops them.
const visibleNotification: Prisma.NotificationWhereInput = {
  OR: [
    { payload: { equals: Prisma.DbNull } },
    { payload: { path: ['inAppVisible'], equals: Prisma.AnyNull } },
    { NOT: { payload: { path: ['inAppVisible'], equals: false } } },
  ],
};

@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: NotificationPrismaService) {}

  async createInAppBatch(
    tx: Prisma.TransactionClient,
    rows: Prisma.NotificationCreateManyInput[],
  ): Promise<number> {
    let count = 0;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const result = await tx.notification.createMany({
        data: rows.slice(offset, offset + 100),
        skipDuplicates: true,
      });
      count += result.count;
    }
    return count;
  }

  list(
    userId: string,
    limit: number,
    isRead?: boolean,
    cursor?: { id: string; createdAt: Date },
  ) {
    return this.db.notification.findMany({
      where: {
        recipientUserId: userId,
        readAt:
          isRead === undefined ? undefined : isRead ? { not: null } : null,
        AND: [visibleNotification],
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: notificationSelect,
    });
  }

  unreadCount(userId: string) {
    return this.db.notification.count({
      where: {
        recipientUserId: userId,
        readAt: null,
        AND: [visibleNotification],
      },
    });
  }

  findOne(userId: string, id: string) {
    return this.db.notification.findFirst({
      where: {
        id,
        recipientUserId: userId,
        AND: [visibleNotification],
      },
      select: notificationSelect,
    });
  }

  async markRead(userId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await tx.notification.updateMany({
        where: { id, recipientUserId: userId, readAt: null },
        data: { readAt: new Date() },
      });
      return tx.notification.findFirst({
        where: { id, recipientUserId: userId },
        select: notificationSelect,
      });
    });
  }

  markAllRead(userId: string) {
    return this.db.notification.updateMany({
      where: {
        recipientUserId: userId,
        readAt: null,
        AND: [visibleNotification],
      },
      data: { readAt: new Date() },
    });
  }
}
