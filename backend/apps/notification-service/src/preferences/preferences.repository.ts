import { Injectable } from '@nestjs/common';
import { NotificationPrismaService } from '../common/notification-prisma.service.js';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

const preferencesSelect = {
  pushEnabled: true,
  inAppEnabled: true,
  emailEnabled: true,
} as const;

@Injectable()
export class PreferencesRepository {
  constructor(private readonly db: NotificationPrismaService) {}

  find(userId: string) {
    return this.db.notificationPreference.findUnique({
      where: { userId },
      select: preferencesSelect,
    });
  }

  update(userId: string, dto: UpdatePreferencesDto) {
    return this.db.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
      select: preferencesSelect,
    });
  }
}
