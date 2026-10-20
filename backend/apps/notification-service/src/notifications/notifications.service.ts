import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository.js';
import type { ListNotificationsDto } from './dto/list-notifications.dto.js';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

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
}
