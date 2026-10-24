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
import { SubmitKycDto } from './dto/submit-kyc.dto.js';

import { RabbitMQService } from '@app/rabbitmq';

function maskIdNumber(idStr?: string | null): string {
  if (!idStr) return '';
  const clean = idStr.trim();
  if (clean.length <= 6) return clean;
  const start = clean.slice(0, 3);
  const end = clean.slice(-3);
  const stars = '*'.repeat(Math.max(3, clean.length - 6));
  return `${start}${stars}${end}`;
}

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

  async getAllActiveUserIds(
    targetGroup?: 'ALL' | 'CUSTOMERS' | 'WORKERS',
  ): Promise<{ userIds: string[] }> {
    const where: any = { status: 'active' };

    if (targetGroup === 'CUSTOMERS') {
      where.customerProfile = { isNot: null };
    } else if (targetGroup === 'WORKERS') {
      where.workerProfile = { isNot: null };
    }

    const users = await this.db.user.findMany({
      where,
      select: { id: true },
    });

    return { userIds: users.map((u) => u.id) };
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
      include: {
        customerProfile: true,
        workerProfile: {
          include: {
            kycCases: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
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

  async submitKyc(
    userId: string,
    dto?: SubmitKycDto,
  ): Promise<unknown> {
    const now = new Date();
    return this.db.$transaction(async (tx: any) => {
      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      if (!worker) {
        let user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          user = await tx.user.create({
            data: {
              id: userId,
              fullName: 'HandyGo Worker',
              status: 'active',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        worker = await tx.workerProfile.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            status: 'pending_kyc',
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        worker = await tx.workerProfile.update({
          where: { id: worker.id },
          data: {
            status: 'pending_kyc',
            updatedAt: now,
          },
        });
      }

      const maskedId = dto?.idNumber ? maskIdNumber(dto.idNumber) : null;
      const kycCase = await tx.kycCase.create({
        data: {
          id: crypto.randomUUID(),
          workerProfileId: worker.id,
          idDocumentType: dto?.idDocumentType || 'CCCD',
          idNumberMasked: maskedId,
          documentFrontRef: dto?.documentFrontRef || '',
          documentBackRef: dto?.documentBackRef || null,
          selfieRef: dto?.selfieRef || '',
          status: 'submitted',
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

      return {
        statusCode: 201,
        message: 'Hồ sơ xác minh danh tính đã được tiếp nhận (đang chờ xử lý)',
        data: {
          workerProfile: worker,
          kycCase,
        },
      };
    });
  }

  async getMyKycStatus(userId: string): Promise<unknown> {
    const worker = await this.db.workerProfile.findUnique({
      where: { userId },
      include: {
        kycCases: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!worker) {
      return {
        statusCode: 200,
        data: {
          workerStatus: 'draft',
          latestKycCase: null,
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        workerStatus: worker.status,
        latestKycCase: worker.kycCases[0] || null,
      },
    };
  }

  async handleKycPending(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const { eventId, producer } = event;
    const payload = (event as any).data || event;
    const eventType = 'kyc.pending';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }
    }

    const userId = payload?.userId;
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

      const now = new Date();
      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      if (!worker) {
        let user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          user = await tx.user.create({
            data: {
              id: userId,
              fullName: 'HandyGo Worker',
              status: 'active',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        worker = await tx.workerProfile.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            status: 'pending_kyc',
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { status: 'pending_kyc', updatedAt: now },
        });
      }

      const activeCase = await tx.kycCase.findFirst({
        where: {
          workerProfileId: worker.id,
          status: { in: ['draft', 'submitted'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeCase) {
        await tx.kycCase.update({
          where: { id: activeCase.id },
          data: {
            status: 'draft',
            updatedAt: now,
          },
        });
      } else {
        await tx.kycCase.create({
          data: {
            id: crypto.randomUUID(),
            workerProfileId: worker.id,
            idDocumentType: 'CCCD',
            documentFrontRef: '',
            selfieRef: '',
            status: 'draft',
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });

    this.logger.log(`KYC pending recorded for user ${userId}`);
    return { processed: true };
  }

  async handleKycSubmitted(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const payload = (event as any).data || event;
    if (payload.ocr || payload.faceVerification) {
      return this.handleKycReviewing(event);
    }

    const { eventId, producer } = event;
    const eventType = 'kyc.submitted';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }
    }

    const userId = payload?.userId;
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

      const now = new Date();
      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      if (!worker) {
        let user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          user = await tx.user.create({
            data: {
              id: userId,
              fullName: 'HandyGo Worker',
              status: 'active',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        worker = await tx.workerProfile.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            status: 'pending_kyc',
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      const activeCase = await tx.kycCase.findFirst({
        where: {
          workerProfileId: worker.id,
          status: { in: ['draft', 'submitted'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeCase) {
        await tx.kycCase.update({
          where: { id: activeCase.id },
          data: {
            status: 'submitted',
            submittedAt: activeCase.submittedAt || now,
            updatedAt: now,
          },
        });
      } else {
        await tx.kycCase.create({
          data: {
            id: crypto.randomUUID(),
            workerProfileId: worker.id,
            idDocumentType: 'CCCD',
            documentFrontRef: '',
            selfieRef: '',
            status: 'submitted',
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });

    this.logger.log(`KYC submitted recorded for user ${userId}`);
    return { processed: true };
  }

  async handleKycReviewing(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const { eventId, producer } = event;
    const payload = (event as any).data || event;
    const eventType = 'kyc.reviewing';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }
    }

    const userId = payload?.userId;
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

      const now = new Date();
      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      if (!worker) {
        let user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          user = await tx.user.create({
            data: {
              id: userId,
              fullName: 'HandyGo Worker',
              status: 'active',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
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

      const ocr = payload.ocr || {};
      const faceVerification = payload.faceVerification || {};
      const rawIdNumber = ocr.id || ocr.card_id || ocr.id_number || 'CCCD';
      const maskedId = maskIdNumber(rawIdNumber) || 'CCCD';
      const frontRef = faceVerification.cropfromCCCD || ocr.image_url || '';
      const selfieRef = faceVerification.selfie_image || '';
      const similarity = faceVerification.similarity ? Number(faceVerification.similarity) : null;

      const activeCase = await tx.kycCase.findFirst({
        where: {
          workerProfileId: worker.id,
          status: { in: ['draft', 'submitted', 'reviewing'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      const defaultNote =
        payload.reviewNote ||
        'Đã hoàn thành đối sánh AI, đang chờ quản trị viên xem xét';

      if (activeCase) {
        await tx.kycCase.update({
          where: { id: activeCase.id },
          data: {
            status: 'reviewing',
            idDocumentType: 'CCCD',
            idNumberMasked: maskedId,
            documentFrontRef: frontRef || activeCase.documentFrontRef,
            selfieRef: selfieRef || activeCase.selfieRef,
            aiSimilarityScore: similarity ?? activeCase.aiSimilarityScore,
            reviewNote: defaultNote,
            submittedAt: activeCase.submittedAt || now,
            updatedAt: now,
          },
        });
      } else {
        await tx.kycCase.create({
          data: {
            id: crypto.randomUUID(),
            workerProfileId: worker.id,
            idDocumentType: 'CCCD',
            idNumberMasked: maskedId,
            documentFrontRef: frontRef,
            selfieRef: selfieRef,
            status: 'reviewing',
            aiSimilarityScore: similarity,
            reviewNote: defaultNote,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });

    this.logger.log(`KYC reviewing processed for user ${userId}`);
    return { processed: true };
  }

  async handleKycCompleted(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const { eventId, producer } = event;
    const payload = (event as any).data || event;
    const eventType = 'kyc.completed';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }
    }

    const userId = payload?.userId;
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

      const now = new Date();
      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      if (worker) {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: {
            status: 'verified',
            verifiedAt: now,
            approvedAt: now,
            updatedAt: now,
          },
        });

        const activeCase = await tx.kycCase.findFirst({
          where: {
            workerProfileId: worker.id,
            status: { in: ['draft', 'submitted', 'reviewing'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (activeCase) {
          await tx.kycCase.update({
            where: { id: activeCase.id },
            data: {
              status: 'approved',
              reviewedAt: now,
              updatedAt: now,
            },
          });
        }
      }
    });

    this.logger.log(`KYC completed (approved) processed for user ${userId}`);
    return { processed: true };
  }

  async handleKycFailed(event: DomainEvent<any>): Promise<{ processed: boolean }> {
    const { eventId, producer } = event;
    const payload = (event as any).data || event;
    const eventType = 'kyc.failed';

    if (eventId) {
      const existing = await this.db.eventInbox.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        return { processed: true };
      }
    }

    const userId = payload?.userId;
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

      const now = new Date();
      let worker = await tx.workerProfile.findUnique({
        where: { userId },
      });

      if (!worker) {
        let user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          user = await tx.user.create({
            data: {
              id: userId,
              fullName: 'HandyGo Worker',
              status: 'active',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        worker = await tx.workerProfile.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            status: 'rejected',
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { status: 'rejected', updatedAt: now },
        });
      }

      const reason = payload?.reason || payload?.message || 'Xác minh AI không thành công';
      const similarity = payload?.similarity ? Number(payload.similarity) : null;

      const activeCase = await tx.kycCase.findFirst({
        where: {
          workerProfileId: worker.id,
          status: { in: ['draft', 'submitted', 'reviewing'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeCase) {
        await tx.kycCase.update({
          where: { id: activeCase.id },
          data: {
            status: 'rejected',
            reviewNote: reason,
            aiSimilarityScore: similarity ?? activeCase.aiSimilarityScore,
            reviewedAt: now,
            updatedAt: now,
          },
        });
      } else {
        await tx.kycCase.create({
          data: {
            id: crypto.randomUUID(),
            workerProfileId: worker.id,
            idDocumentType: 'CCCD',
            documentFrontRef: '',
            selfieRef: '',
            status: 'rejected',
            reviewNote: reason,
            aiSimilarityScore: similarity,
            submittedAt: now,
            reviewedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });

    this.logger.log(`KYC failed processed for user ${userId}: ${payload?.reason || 'unspecified'}`);
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

  /**
   * Internal candidate discovery for Matching Service.
   * Adheres to microservice data boundaries and MATCHING_DATA_CONTRACTS.md.
   */
  async findWorkerCandidates(params: {
    serviceId: string;
    latitude: number;
    longitude: number;
    customerUserId?: string;
  }): Promise<WorkerCandidateDto[]> {
    const { serviceId, latitude, longitude, customerUserId } = params;

    const workers = await this.db.workerProfile.findMany({
      where: {
        status: 'verified',
        user: {
          status: 'active',
          ...(customerUserId ? { id: { not: customerUserId } } : {}),
        },
        serviceOfferings: {
          some: {
            serviceId,
            isActive: true,
          },
        },
        serviceAreas: {
          some: {
            isActive: true,
          },
        },
        kycCases: {
          some: {
            status: 'approved',
          },
        },
      },
      include: {
        user: true,
        serviceOfferings: {
          where: { serviceId, isActive: true },
        },
        serviceAreas: {
          where: { isActive: true },
        },
      },
    });

    const candidates: WorkerCandidateDto[] = [];

    for (const worker of workers) {
      const offering = worker.serviceOfferings[0];
      if (!offering) continue;

      let minDistance = Infinity;
      let matchedArea: (typeof worker.serviceAreas)[0] | null = null;

      for (const area of worker.serviceAreas) {
        const areaLat = Number(area.latitude);
        const areaLon = Number(area.longitude);
        const radius = Number(area.radiusKm);

        // Haversine formula
        const R = 6371;
        const dLat = (areaLat - latitude) * (Math.PI / 180);
        const dLon = (areaLon - longitude) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(latitude * (Math.PI / 180)) *
            Math.cos(areaLat * (Math.PI / 180)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = R * c;

        if (dist <= radius && dist < minDistance) {
          minDistance = dist;
          matchedArea = area;
        }
      }

      if (matchedArea && minDistance !== Infinity) {
        candidates.push({
          workerUserId: worker.userId,
          workerProfileId: worker.id,
          offeringTitle: offering.title || '',
          offeringDescription: offering.description || '',
          experienceYears: offering.experienceYears || 0,
          centerLatitude: Number(matchedArea.latitude),
          centerLongitude: Number(matchedArea.longitude),
          radiusKm: Number(matchedArea.radiusKm),
          distanceKm: Math.round(minDistance * 100) / 100,
          averageRating: Number(worker.averageRating),
          ratingCount: worker.ratingCount,
          completedOrderCount: worker.completedOrderCount,
        });
      }
    }

    return candidates;
  }

  /**
   * Internal worker match profile lookup for worker job discovery.
   */
  async getWorkerMatchProfile(workerUserId: string): Promise<{
    workerUserId: string;
    workerProfileId: string;
    isVerified: boolean;
    serviceIds: string[];
    serviceAreas: Array<{
      latitude: number;
      longitude: number;
      radiusKm: number;
    }>;
  } | null> {
    const worker = await this.db.workerProfile.findUnique({
      where: { userId: workerUserId },
      include: {
        user: true,
        serviceOfferings: {
          where: { isActive: true },
        },
        serviceAreas: {
          where: { isActive: true },
        },
        kycCases: {
          where: { status: 'approved' },
        },
      },
    });

    if (!worker || worker.user.status !== 'active') {
      return null;
    }

    const hasApprovedKyc = worker.kycCases.length > 0;
    const isVerified = worker.status === 'verified' && hasApprovedKyc;

    return {
      workerUserId: worker.userId,
      workerProfileId: worker.id,
      isVerified,
      serviceIds: worker.serviceOfferings.map((o: any) => o.serviceId),
      serviceAreas: worker.serviceAreas.map((a: any) => ({
        latitude: Number(a.latitude),
        longitude: Number(a.longitude),
        radiusKm: Number(a.radiusKm),
      })),
    };
  }
}

