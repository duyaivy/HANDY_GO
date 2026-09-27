import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserTrustPrismaService } from '@app/database';
import { StandardPermissions } from '@app/auth';
import type { DomainEvent } from '@app/common';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserRegisteredData {
  userId: string;
  accountId: string;
  fullName: string;
  phone: string;
  email: string;
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

      const user = existingUser
        ? existingUser
        : await tx.user.create({
            data: {
              id: data.userId,
              fullName: data.fullName,
              phone: data.phone,
              email: data.email,
              status: 'active',
            },
          });

      // 3. Create customer profile if not exists
      const existingCustomerProfile = await tx.customerProfile.findUnique({
        where: { userId: user.id },
      });

      if (!existingCustomerProfile) {
        await tx.customerProfile.create({
          data: {
            userId: user.id,
            loyaltyPoints: 0,
          },
        });
      }
    });

    this.logger.log(
      `User & CustomerProfile created for userId ${data.userId} from event ${eventId}.`,
    );

    return { processed: true, idempotent: false };
  }

  async getUserAuthStatus(
    userId: string,
  ): Promise<{ exists: boolean; status: string; isProvisioned: boolean }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { customerProfile: true },
    });

    if (!user) {
      return { exists: false, status: 'none', isProvisioned: false };
    }

    return {
      exists: true,
      status: user.status,
      isProvisioned: Boolean(user.customerProfile),
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
      include: { customerProfile: true },
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
        phone: user.phone,
        email: user.email,
        status: user.status,
        customerProfile: user.customerProfile,
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
      },
      include: { customerProfile: true },
    });

    return {
      statusCode: 200,
      message: 'Cập nhật hồ sơ thành công',
      data: {
        id: updated.id,
        fullName: updated.fullName,
        phone: updated.phone,
        email: updated.email,
        status: updated.status,
        customerProfile: updated.customerProfile,
        updatedAt: updated.updatedAt,
      },
    };
  }
}
