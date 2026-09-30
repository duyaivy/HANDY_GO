import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { UserTrustPrismaService } from '@app/database';
import { StandardPermissions } from '@app/auth';
import type { DomainEvent } from '@app/common';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserRegisteredData {
  userId: string;
  accountId: string;
  fullName: string;
  role: 'Customer' | 'Worker';
}

@Injectable()
export class UserTrustServiceService {
  private readonly logger = new Logger(UserTrustServiceService.name);

  constructor(private readonly db: UserTrustPrismaService) {}

  async handleUserRegistered(
    event: DomainEvent<UserRegisteredData>,
  ): Promise<{ processed: boolean; idempotent: boolean }> {
    const { eventId, producer, data } = event;
    const eventType = 'user.registered';

    if (event.eventVersion !== 2 || !['Customer', 'Worker'].includes(data.role)) {
      this.logger.warn(`Ignoring unsupported user.registered event ${eventId}`);
      return { processed: false, idempotent: false };
    }

    // Check event inbox for idempotency
    const existingEvent = await this.db.eventInbox.findUnique({
      where: { id: eventId },
    });

    if (existingEvent) {
      this.logger.log(
        `Event ${eventId} (${eventType}) has already been processed. Skipping idempotently.`,
      );
      return { processed: true, idempotent: true };
    }

    // Process event in atomic transaction
    await this.db.$transaction(async (tx) => {
      // Re-verify inbox inside transaction for concurrency safety
      const inTxEvent = await tx.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (inTxEvent) {
        return;
      }

      // 1. Record event in inbox
      await tx.eventInbox.create({
        data: {
          id: eventId,
          producer,
          eventType,
          payload: JSON.parse(JSON.stringify(event)),
          receivedAt: new Date(),
          processedAt: new Date(),
        },
      });

      // 2. Create user if not exists (never overwrite modified profile)
      const existingUser = await tx.user.findUnique({
        where: { id: data.userId },
      });

      const now = new Date();
      const user = existingUser
        ? existingUser
        : await tx.user.create({
            data: {
              id: data.userId,
              fullName: data.fullName,
              status: 'active',
              createdAt: now,
              updatedAt: now,
            },
          });

      if (data.role === 'Customer') {
        await tx.customerProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            id: crypto.randomUUID(),
            userId: user.id,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        await tx.workerProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            id: crypto.randomUUID(),
            userId: user.id,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });

    this.logger.log(
      `User & ${data.role}Profile provisioned for userId ${data.userId} from event ${eventId}.`,
    );

    return { processed: true, idempotent: false };
  }

  async getUserAuthStatus(
    userId: string,
    roles: string[],
  ): Promise<{ exists: boolean; status: string; isProvisioned: boolean }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { customerProfile: true, workerProfile: true },
    });

    if (!user) {
      return { exists: false, status: 'none', isProvisioned: false };
    }

    const hasProfileRole = roles.includes('Customer') || roles.includes('Worker');

    return {
      exists: true,
      status: user.status,
      isProvisioned:
        (hasProfileRole || roles.includes('Admin')) &&
        (!roles.includes('Customer') || Boolean(user.customerProfile)) &&
        (!roles.includes('Worker') || Boolean(user.workerProfile)),
    };
  }

  async getProfile(
    requestingUserId: string,
    targetUserId: string,
    userPermissions: string[] = [],
  ): Promise<unknown> {
    // Only allow reading own profile unless admin with user:read
    if (
      requestingUserId !== targetUserId &&
      !userPermissions.includes(StandardPermissions.USER_READ)
    ) {
      throw new ForbiddenException(
        'Endpoint profile chỉ cho đọc/sửa dữ liệu của chính userId',
      );
    }

    const user = await this.db.user.findUnique({
      where: { id: targetUserId },
      include: { customerProfile: true, workerProfile: true },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    return {
      statusCode: 200,
      message: 'Lấy thông tin hồ sơ thành công',
      data: {
        id: user.id,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        customerProfile: user.customerProfile,
        workerProfile: user.workerProfile,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  async updateProfile(
    requestingUserId: string,
    targetUserId: string,
    dto: UpdateProfileDto,
    userPermissions: string[] = [],
  ): Promise<unknown> {
    // Only allow updating own profile unless admin with user:manage
    if (
      requestingUserId !== targetUserId &&
      !userPermissions.includes(StandardPermissions.USER_MANAGE)
    ) {
      throw new ForbiddenException(
        'Endpoint profile chỉ cho đọc/sửa dữ liệu của chính userId',
      );
    }

    const existing = await this.db.user.findUnique({
      where: { id: targetUserId },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    const updated = await this.db.user.update({
      where: { id: targetUserId },
      data: {
        fullName: dto.fullName.trim(),
        updatedAt: new Date(),
      },
      include: { customerProfile: true, workerProfile: true },
    });

    return {
      statusCode: 200,
      message: 'Cập nhật hồ sơ thành công',
      data: {
        id: updated.id,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl,
        status: updated.status,
        customerProfile: updated.customerProfile,
        workerProfile: updated.workerProfile,
        updatedAt: updated.updatedAt,
      },
    };
  }
}
