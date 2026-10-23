import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/notification-client';
import { NotificationPrismaService } from '../common/notification-prisma.service.js';
import type { RegisterDeviceDto } from './dto/register-device.dto.js';

const deviceSelect = {
  id: true,
  platform: true,
  deviceId: true,
  provider: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DeviceTokenSelect;

@Injectable()
export class DevicesRepository {
  constructor(private readonly db: NotificationPrismaService) {}

  register(userId: string, dto: RegisterDeviceDto) {
    return this.db.$transaction(async (tx) => {
      // Serialize registrations for this user across service instances. Unique
      // indexes also protect against simultaneous claims by different users.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))::text`;
      const token = await tx.deviceToken.findUnique({
        where: { pushToken: dto.pushToken },
        select: { id: true, userId: true, deviceId: true },
      });
      if (token && token.userId !== userId)
        throw new ConflictException('Device token is already registered');
      const device = dto.deviceId
        ? await tx.deviceToken.findUnique({
            where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
            select: { id: true },
          })
        : null;
      if (
        token &&
        ((device && device.id !== token.id) ||
          (dto.deviceId && token.deviceId && dto.deviceId !== token.deviceId))
      ) {
        throw new ConflictException(
          'Device token is already registered to another installation',
        );
      }
      const existing = device ?? token;
      const data = {
        platform: dto.platform,
        deviceId: dto.deviceId,
        pushToken: dto.pushToken,
        isActive: true,
        lastSeenAt: new Date(),
      };
      return existing
        ? tx.deviceToken.update({
            where: { id: existing.id, userId },
            data,
            select: deviceSelect,
          })
        : tx.deviceToken.create({
            data: { ...data, userId },
            select: deviceSelect,
          });
    });
  }

  deactivate(userId: string, id: string) {
    return this.db.deviceToken.updateMany({
      where: { id, userId },
      data: { isActive: false },
    });
  }

  deactivateById(id: string) {
    return this.db.deviceToken.updateMany({
      where: { id },
      data: { isActive: false },
    });
  }

  deactivateByPushToken(pushToken: string) {
    return this.db.deviceToken.updateMany({
      where: { pushToken },
      data: { isActive: false },
    });
  }

  findActiveByUserIds(
    userIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.deviceToken.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        platform: true,
        pushToken: true,
        deviceId: true,
      },
    });
  }
}

