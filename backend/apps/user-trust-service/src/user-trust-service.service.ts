import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { UserTrustPrismaService } from '@app/database';
import { RegisterRole, Role, StandardPermissions } from '@app/auth';
import type { DomainEvent } from '@app/common';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

import { RabbitMQService } from '@app/rabbitmq';

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

  constructor(
    private readonly db: UserTrustPrismaService,
    @Optional()
    private readonly rabbitmq?: RabbitMQService,
  ) {}

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

  async handleKycSubmitted(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const { eventId, producer, data } = event;
    const eventType = 'kyc.submitted';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }
    }

    const userId = data?.userId;
    if (!userId) {
      return { processed: false };
    }

    await this.db.$transaction(async (tx: any) => {
      if (eventId) {
        await tx.eventInbox.create({
          data: {
            id: eventId,
            producer: producer || 'ai-service',
            eventType,
            payload: JSON.parse(JSON.stringify(event)),
            receivedAt: new Date(),
            processedAt: new Date(),
          },
        });
      }

      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      const now = new Date();
      if (!worker) {
        worker = await tx.workerProfile.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            status: 'under_review',
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { status: 'under_review', updatedAt: now },
        });
      }

      const ocr = data.ocr || {};
      const faceVerification = data.faceVerification || {};
      const idNumber = ocr.id || ocr.card_id || ocr.id_number || 'CCCD';

      await tx.kycCase.create({
        data: {
          id: crypto.randomUUID(),
          workerProfileId: worker.id,
          idDocumentType: 'CCCD',
          idNumberMasked: String(idNumber),
          documentFrontRef: faceVerification.cropfromCCCD || ocr.image_url || '',
          selfieRef: faceVerification.selfie_image || '',
          status: 'submitted',
          aiSimilarityScore: faceVerification.similarity ? Number(faceVerification.similarity) : null,
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
    });

    this.logger.log(`KYC submitted processed for user ${userId}`);
    return { processed: true };
  }

  async handleKycFailed(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const { eventId, producer, data } = event;
    const eventType = 'kyc.failed';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }

      await this.db.eventInbox.create({
        data: {
          id: eventId,
          producer: producer || 'ai-service',
          eventType,
          payload: JSON.parse(JSON.stringify(event)),
          receivedAt: new Date(),
          processedAt: new Date(),
        },
      });
    }

    this.logger.warn(`KYC failed event recorded for user ${data?.userId}: ${data?.reason}`);
    return { processed: true };
  }

  async listKycCases(status?: string, page = 1, limit = 20) {
    const take = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [cases, total] = await Promise.all([
      this.db.kycCase.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          workerProfile: {
            include: {
              user: true,
            },
          },
          reviewer: true,
        },
      }),
      this.db.kycCase.count({ where }),
    ]);

    return {
      statusCode: 200,
      data: cases,
      pagination: {
        page: Number(page) || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getKycCase(id: string) {
    const kycCase = await this.db.kycCase.findUnique({
      where: { id },
      include: {
        workerProfile: {
          include: {
            user: true,
          },
        },
        reviewer: true,
      },
    });

    if (!kycCase) {
      throw new NotFoundException('Không tìm thấy hồ sơ KYC.');
    }

    return {
      statusCode: 200,
      data: kycCase,
    };
  }

  async reviewKycCase(
    adminUserId: string,
    kycCaseId: string,
    decision: 'approved' | 'rejected',
    note?: string,
  ) {
    const kycCase = await this.db.kycCase.findUnique({
      where: { id: kycCaseId },
      include: { workerProfile: true },
    });

    if (!kycCase) {
      throw new NotFoundException('Không tìm thấy hồ sơ KYC.');
    }

    const now = new Date();
    const isApproved = decision === 'approved';

    const updated = await this.db.$transaction(async (tx: any) => {
      const updatedCase = await tx.kycCase.update({
        where: { id: kycCaseId },
        data: {
          status: isApproved ? 'approved' : 'rejected',
          reviewedByUserId: adminUserId,
          reviewedAt: now,
          reviewNote: note || null,
          updatedAt: now,
        },
      });

      await tx.workerProfile.update({
        where: { id: kycCase.workerProfileId },
        data: {
          status: isApproved ? 'verified' : 'rejected',
          verifiedAt: isApproved ? now : undefined,
          approvedAt: isApproved ? now : undefined,
          updatedAt: now,
        },
      });

      return updatedCase;
    });

    if (this.rabbitmq) {
      const pattern = isApproved ? 'kyc.completed' : 'kyc.failed';
      await this.rabbitmq.emit(pattern, {
        kycCaseId,
        workerProfileId: kycCase.workerProfileId,
        decision,
        reviewedBy: adminUserId,
        reviewedAt: now.toISOString(),
        note,
      });
    }

    return {
      statusCode: 200,
      message: isApproved ? 'Đã phê duyệt KYC thành công' : 'Đã từ chối KYC',
      data: updated,
    };
  }
}

