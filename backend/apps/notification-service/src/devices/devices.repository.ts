import { Injectable } from '@nestjs/common';
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
      // Serialize registrations on pushToken and user to prevent concurrent race conditions
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.pushToken}::text, 0))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))::text`;

      const existingToken = await tx.deviceToken.findUnique({
        where: { pushToken: dto.pushToken },
        select: { id: true, userId: true, deviceId: true, isActive: true },
      });

      // If token belongs to another user: atomically rebind ownership to the new user
      if (existingToken && existingToken.userId !== userId) {
        // Invalidate old owner's token and free up unique pushToken constraint
        await tx.deviceToken.update({
          where: { id: existingToken.id },
          data: {
            isActive: false,
            pushToken: `${dto.pushToken}:rebound:${existingToken.id}`,
          },
        });

        // Cancel any pending or in-flight delivery attempts for the old owner
        await tx.notificationDeliveryAttempt.updateMany({
          where: {
            deviceTokenId: existingToken.id,
            status: { in: ['queued', 'processing'] },
          },
          data: {
            status: 'failed',
            errorMessage: 'Device rebound to another user',
          },
        });
      }

      // Check if this user already has an existing token for this installation deviceId
      const userDevice = dto.deviceId
        ? await tx.deviceToken.findUnique({
            where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
            select: { id: true, pushToken: true },
          })
        : null;

      // If user had another record for this deviceId with a different pushToken, retire it
      if (
        userDevice &&
        existingToken &&
        existingToken.userId === userId &&
        userDevice.id !== existingToken.id
      ) {
        await tx.deviceToken.update({
          where: { id: userDevice.id },
          data: {
            isActive: false,
            pushToken: `${userDevice.pushToken}:superseded:${userDevice.id}`,
          },
        });
      }

      const targetId =
        existingToken && existingToken.userId === userId
          ? existingToken.id
          : userDevice?.id;

      const data = {
        platform: dto.platform,
        deviceId: dto.deviceId,
        pushToken: dto.pushToken,
        isActive: true,
        lastSeenAt: new Date(),
      };

      return targetId
        ? tx.deviceToken.update({
            where: { id: targetId },
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

  deactivateIfTokenMatches(id: string, pushToken: string) {
    return this.db.deviceToken.updateMany({
      where: { id, pushToken },
      data: { isActive: false },
    });
  }

  deactivateByPushToken(pushToken: string) {
    return this.db.deviceToken.updateMany({
      where: { pushToken },
      data: { isActive: false },
    });
  }

  findActiveByUserIds(userIds: string[], tx?: Prisma.TransactionClient) {
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
