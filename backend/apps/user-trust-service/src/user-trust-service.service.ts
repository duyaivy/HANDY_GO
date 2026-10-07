import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { UserTrustPrismaService } from '@app/database';
import { RegisterRole, Role, StandardPermissions } from '@app/auth';
import type { DomainEvent } from '@app/common';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserRegisteredData {
  userId: string;
  accountId: string;
  fullName: string;
  roles?: string[];
  role?: RegisterRole;
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

    const validRoles = Object.values(RegisterRole) as string[];
    const isVersion3 =
      event.eventVersion === 3 &&
      Array.isArray(data.roles) &&
      data.roles.includes(RegisterRole.CUSTOMER) &&
      data.roles.includes(RegisterRole.WORKER);
    const isVersion2 =
      event.eventVersion === 2 &&
      typeof data.role === 'string' &&
      validRoles.includes(data.role);

    if (!isVersion3 && !isVersion2) {
      this.logger.warn(`Ignoring unsupported or invalid user.registered event ${eventId}`);
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

      if (isVersion3) {
        // Unified account: upsert both CustomerProfile and WorkerProfile in same transaction
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

        await tx.workerProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            id: crypto.randomUUID(),
            userId: user.id,
            status: 'draft',
            verifiedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        if (data.role === RegisterRole.CUSTOMER) {
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
        } else if (data.role === RegisterRole.WORKER) {
          await tx.workerProfile.upsert({
            where: { userId: user.id },
            update: {},
            create: {
              id: crypto.randomUUID(),
              userId: user.id,
              status: 'draft',
              verifiedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      }
    });

    this.logger.log(
      `User and profiles provisioned for userId ${data.userId} from event ${eventId}.`,
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

    const hasProfileRole =
      roles.includes(RegisterRole.CUSTOMER) || roles.includes(RegisterRole.WORKER);

    return {
      exists: true,
      status: user.status,
      isProvisioned:
        (hasProfileRole || roles.includes(Role.ADMIN)) &&
        (!roles.includes(RegisterRole.CUSTOMER) || Boolean(user.customerProfile)) &&
        (!roles.includes(RegisterRole.WORKER) || Boolean(user.workerProfile)),
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
