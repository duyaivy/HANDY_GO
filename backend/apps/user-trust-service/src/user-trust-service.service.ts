import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { UserTrustPrismaService } from '@app/database';
import { RegisterRole, Role, StandardPermissions } from '@app/auth';
import type { DomainEvent } from '@app/common';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { CloudinaryService } from '@app/cloudinary';
import { SubmitKycDto } from './dto/submit-kyc.dto.js';
import { ListWorkerReviewsDto } from './dto/list-worker-reviews.dto.js';
import { SubmitWorkerRegistrationDto } from './dto/submit-worker-registration.dto.js';
import { ListWorkerRegistrationsDto } from './dto/list-worker-registrations.dto.js';
import { ReviewWorkerRegistrationDto } from './dto/review-worker-registration.dto.js';
import { Prisma } from '@prisma/user-trust-client';
import { CatalogClient } from './clients/catalog.client.js';

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

function isRegistrationPayloadMatch(
  existing: any,
  dto: SubmitWorkerRegistrationDto,
): boolean {
  if (!existing || !dto) return false;
  try {
    const existingCatIds = Array.isArray(existing.categoryIds)
      ? [...existing.categoryIds].map(String).sort()
      : [];
    const dtoCatIds = Array.isArray(dto.categoryIds)
      ? [...dto.categoryIds].map(String).sort()
      : [];
    if (JSON.stringify(existingCatIds) !== JSON.stringify(dtoCatIds)) {
      return false;
    }

    const existingServiceIds = Array.isArray(existing.services)
      ? existing.services.map((s: any) => String(s?.serviceId || '')).sort()
      : [];
    const dtoServiceIds = Array.isArray(dto.services)
      ? dto.services.map((s: any) => String(s?.serviceId || '')).sort()
      : [];
    if (JSON.stringify(existingServiceIds) !== JSON.stringify(dtoServiceIds)) {
      return false;
    }

    const existingAddr = (existing.serviceArea?.address || '')
      .trim()
      .toLowerCase();
    const dtoAddr = (dto.serviceArea?.address || '').trim().toLowerCase();
    if (existingAddr !== dtoAddr) {
      return false;
    }

    const existingEvidence = Array.isArray(existing.evidenceFiles)
      ? existing.evidenceFiles.map((e: any) => String(e?.url || '')).sort()
      : [];
    const dtoEvidence = Array.isArray(dto.evidenceFiles)
      ? dto.evidenceFiles.map((e: any) => String(e?.url || '')).sort()
      : [];
    if (JSON.stringify(existingEvidence) !== JSON.stringify(dtoEvidence)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export interface UserRegisteredData {
  userId: string;
  accountId: string;
  fullName: string;
  roles?: string[];
  role?: RegisterRole;
}

export interface WorkerCandidateDto {
  workerUserId: string;
  workerProfileId: string;
  offeringTitle: string;
  offeringDescription: string;
  experienceYears: number;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  distanceKm: number;
  averageRating: number;
  ratingCount: number;
  completedOrderCount: number;
  userStatus?: string;
  workerProfileStatus?: string;
  hasApprovedKyc?: boolean;
}

@Injectable()
export class UserTrustServiceService {
  private readonly logger = new Logger(UserTrustServiceService.name);

  constructor(
    private readonly db: UserTrustPrismaService,
    @Optional()
    private readonly rabbitmq?: RabbitMQService,
    @Optional()
    private readonly cloudinaryService?: CloudinaryService,
    @Optional()
    private readonly catalogClient?: CatalogClient,
  ) {}

  /**
   * `active` chỉ nghĩa là user đang active; KHÔNG chứng minh tài khoản ngân hàng đã được ngân hàng xác minh.
   * Việc xác minh thật với ngân hàng/provider sẽ bổ sung sau.
   */
  async verifyBankAccountOwnership(
    userId: string,
    bankAccountId: string,
  ): Promise<{ owned: boolean; active: boolean }> {
    const account = await this.db.userBankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId,
        user: { status: 'active' },
      },
      select: { id: true },
    });

    return { owned: account !== null, active: account !== null };
  }

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
            serviceOfferings: true,
            serviceAreas: true,
            kycCases: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        bankAccounts: {
          orderBy: { createdAt: 'asc' },
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
        bankAccounts: user.bankAccounts,
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

    const now = new Date();
    const updateUserData: any = {
      updatedAt: now,
    };
    if (dto.fullName !== undefined) {
      updateUserData.fullName = dto.fullName.trim();
    }
    if (dto.avatarUrl !== undefined) {
      updateUserData.avatarUrl = dto.avatarUrl?.trim() || null;
    }

    let updatedCustomerProfile: any = null;
    if (dto.bio !== undefined) {
      updatedCustomerProfile = await this.db.customerProfile.upsert({
        where: { userId: targetUserId },
        update: {
          bio: dto.bio?.trim() || null,
          updatedAt: now,
        },
        create: {
          id: crypto.randomUUID(),
          userId: targetUserId,
          bio: dto.bio?.trim() || null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const updated = await this.db.user.update({
      where: { id: targetUserId },
      data: updateUserData,
      include: {
        customerProfile: true,
        workerProfile: {
          include: {
            serviceOfferings: true,
            serviceAreas: true,
            kycCases: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        bankAccounts: true,
      },
    });

    return {
      statusCode: 200,
      message: 'Cập nhật hồ sơ thành công',
      data: {
        id: updated.id,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl,
        status: updated.status,
        customerProfile: updatedCustomerProfile || updated.customerProfile,
        workerProfile: updated.workerProfile,
        bankAccounts: updated.bankAccounts,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<unknown> {
    if (!this.cloudinaryService) {
      throw new BadRequestException(
        'Dịch vụ upload ảnh Cloudinary chưa được cấu hình',
      );
    }

    const existing = await this.db.user.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    const uploadResult = await this.cloudinaryService.uploadImage(file);
    const now = new Date();

    const updated = await this.db.user.update({
      where: { id: userId },
      data: {
        avatarUrl: uploadResult.url,
        updatedAt: now,
      },
      include: {
        customerProfile: true,
        workerProfile: true,
      },
    });

    return {
      statusCode: 200,
      message: 'Cập nhật ảnh đại diện thành công',
      data: {
        id: updated.id,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl,
        asset: uploadResult,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async getBankAccounts(userId: string): Promise<unknown> {
    const accounts = await this.db.userBankAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      statusCode: 200,
      message: 'Lấy danh sách tài khoản ngân hàng thành công',
      data: accounts,
    };
  }

  async addBankAccount(
    userId: string,
    dto: CreateBankAccountDto,
  ): Promise<unknown> {
    const existingCount = await this.db.userBankAccount.count({
      where: { userId },
    });

    const isDefault = dto.isDefault ?? existingCount === 0;
    const now = new Date();

    const created = await this.db.$transaction(async (tx) => {
      if (isDefault && existingCount > 0) {
        await tx.userBankAccount.updateMany({
          where: { userId },
          data: { isDefault: false, updatedAt: now },
        });
      }

      return tx.userBankAccount.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          bankCode: dto.bankCode.trim().toUpperCase(),
          bankName: dto.bankName.trim(),
          accountNumber: dto.accountNumber.trim(),
          accountHolderName: dto.accountHolderName.trim().toUpperCase(),
          isDefault,
          createdAt: now,
          updatedAt: now,
        },
      });
    });

    return {
      statusCode: 201,
      message: 'Thêm tài khoản ngân hàng thành công',
      data: created,
    };
  }

  async listUsers(query: ListUsersDto): Promise<unknown> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.role === 'customer') {
      where.customerProfile = { isNot: null };
    } else if (query.role === 'worker') {
      where.workerProfile = { isNot: null };
    }

    if (query.search && query.search.trim().length > 0) {
      const searchTrim = query.search.trim();
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          searchTrim,
        );

      if (isUuid) {
        where.OR = [
          { id: searchTrim },
          { fullName: { contains: searchTrim, mode: 'insensitive' } },
        ];
      } else {
        where.fullName = { contains: searchTrim, mode: 'insensitive' };
      }
    }

    const [total, users] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customerProfile: true,
          workerProfile: {
            select: {
              id: true,
              status: true,
              averageRating: true,
              ratingCount: true,
              completedOrderCount: true,
              orderCountTotal: true,
              verifiedAt: true,
              approvedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          bankAccounts: {
            select: {
              id: true,
              bankCode: true,
              bankName: true,
              accountNumber: true,
              accountHolderName: true,
              isDefault: true,
            },
          },
        },
      }),
    ]);

    const items = users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      status: u.status,
      roles: [
        ...(u.customerProfile ? ['customer'] : []),
        ...(u.workerProfile ? ['worker'] : []),
      ],
      customerProfile: u.customerProfile
        ? {
            id: u.customerProfile.id,
            bio: u.customerProfile.bio,
            createdAt: u.customerProfile.createdAt,
            updatedAt: u.customerProfile.updatedAt,
          }
        : null,
      workerProfile: u.workerProfile,
      bankAccounts: u.bankAccounts,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách người dùng thành công',
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async deleteBankAccount(userId: string, accountId: string): Promise<unknown> {
    const account = await this.db.userBankAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    }

    await this.db.userBankAccount.delete({
      where: { id: accountId },
    });

    return {
      statusCode: 200,
      message: 'Xóa tài khoản ngân hàng thành công',
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

  async getWorkersBatchSummary(userIds: string[]): Promise<any[]> {
    if (!userIds || userIds.length === 0) return [];
    const workers = await this.db.workerProfile.findMany({
      where: {
        userId: { in: userIds },
      },
      include: {
        user: true,
      },
    });

    return workers.map((w) => ({
      workerId: w.userId,
      workerUserId: w.userId,
      fullName: w.user.fullName,
      avatarUrl: w.user.avatarUrl,
      averageRating: Number(w.averageRating || 5.0),
      ratingCount: w.ratingCount || 0,
      completedOrderCount: w.completedOrderCount || 0,
      orderCountTotal: w.orderCountTotal || 0,
      status: w.status,
    }));
  }

  /**
   * Lấy hồ sơ công khai của thợ (Public Profile) dành cho khách hàng
   * xem khi nhận gợi ý từ AI Matching hoặc nhận báo giá từ Bidding.
   */
  async getWorkerPublicProfile(workerIdentifier: string): Promise<unknown> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workerIdentifier,
      );

    if (!isUuid) {
      throw new BadRequestException('Mã định danh thợ không đúng định dạng UUID');
    }

    const worker = await this.db.workerProfile.findFirst({
      where: {
        OR: [{ id: workerIdentifier }, { userId: workerIdentifier }],
      },
      include: {
        user: {
          include: {
            customerProfile: true,
          },
        },
        serviceOfferings: {
          orderBy: { createdAt: 'desc' },
        },
        serviceAreas: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!worker || worker.user.status === 'deleted') {
      throw new NotFoundException('Không tìm thấy thông tin thợ hoặc tài khoản đã bị xóa');
    }

    // Lấy phân bố số sao (1-5 sao)
    const ratingGroups = await this.db.workerReview.groupBy({
      by: ['rating'],
      where: {
        workerUserId: worker.userId,
        status: 'published',
      },
      _count: {
        rating: true,
      },
    });

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const g of ratingGroups) {
      if (g.rating >= 1 && g.rating <= 5) {
        ratingDistribution[g.rating] = g._count.rating;
      }
    }

    // Lấy 5 nhận xét gần nhất đã được phê duyệt (status: published)
    const recentReviews = await this.db.workerReview.findMany({
      where: {
        workerUserId: worker.userId,
        status: 'published',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const averageRatingNum =
      worker.ratingCount > 0
        ? Number(Number(worker.averageRating).toFixed(2))
        : 0;

    return {
      statusCode: 200,
      data: {
        id: worker.id,
        userId: worker.userId,
        fullName: worker.user.fullName,
        avatarUrl: worker.user.avatarUrl,
        bio: worker.user.customerProfile?.bio ?? null,
        status: worker.status,
        isVerified: worker.status === 'verified',
        verifiedAt: worker.verifiedAt,
        approvedAt: worker.approvedAt,
        memberSince: worker.createdAt,
        stats: {
          averageRating: averageRatingNum,
          ratingCount: worker.ratingCount,
          completedOrderCount: worker.completedOrderCount,
          orderCountTotal: worker.orderCountTotal,
          ratingDistribution,
        },
        services: worker.serviceOfferings.map((s) => ({
          id: s.id,
          serviceId: s.serviceId,
          title: s.title,
          description: s.description,
          experienceYears: s.experienceYears ?? 0,
          isActive: s.isActive,
        })),
        serviceAreas: worker.serviceAreas.map((a) => ({
          id: a.id,
          latitude: Number(a.latitude),
          longitude: Number(a.longitude),
          radiusKm: Number(a.radiusKm),
          isActive: a.isActive,
        })),
        recentReviews: recentReviews.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          rating: r.rating,
          attitudeRating: r.attitudeRating,
          qualityRating: r.qualityRating,
          speedRating: r.speedRating,
          comment: r.comment,
          createdAt: r.createdAt,
          customer: {
            id: r.customer.id,
            fullName: r.customer.fullName,
            avatarUrl: r.customer.avatarUrl,
          },
        })),
      },
    };
  }

  /**
   * Lấy danh sách đánh giá nhận xét của thợ có hỗ trợ phân trang và lọc theo số sao
   */
  async getWorkerReviews(
    workerIdentifier: string,
    query: ListWorkerReviewsDto,
  ): Promise<unknown> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workerIdentifier,
      );

    if (!isUuid) {
      throw new BadRequestException('Mã định danh thợ không đúng định dạng UUID');
    }

    const worker = await this.db.workerProfile.findFirst({
      where: {
        OR: [{ id: workerIdentifier }, { userId: workerIdentifier }],
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!worker) {
      throw new NotFoundException('Không tìm thấy thông tin thợ');
    }

    const take = Math.max(1, Math.min(50, Number(query.limit) || 10));
    const skip = (Math.max(1, Number(query.page) || 1) - 1) * take;

    const where: any = {
      workerUserId: worker.userId,
      status: 'published',
    };

    if (query.rating !== undefined && query.rating !== null) {
      where.rating = Number(query.rating);
    }

    const [reviews, total] = await Promise.all([
      this.db.workerReview.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.db.workerReview.count({ where }),
    ]);

    return {
      statusCode: 200,
      data: reviews.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        rating: r.rating,
        attitudeRating: r.attitudeRating,
        qualityRating: r.qualityRating,
        speedRating: r.speedRating,
        comment: r.comment,
        createdAt: r.createdAt,
        customer: {
          id: r.customer.id,
          fullName: r.customer.fullName,
          avatarUrl: r.customer.avatarUrl,
        },
      })),
      pagination: {
        page: Number(query.page) || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  private async validateAndEnrichServices(
    categoryIds: string[],
    services: any[],
  ) {
    if (!categoryIds || categoryIds.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 danh mục dịch vụ');
    }

    if (!services || services.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 dịch vụ đăng ký');
    }

    const serviceIds = [...new Set(services.map((s) => s.serviceId))];

    if (!this.catalogClient) {
      throw new ServiceUnavailableException(
        'Catalog client is not configured or unavailable',
      );
    }

    // Xác thực danh mục và dịch vụ từ Catalog Service qua HTTP Client thay vì truy vấn trực tiếp schema DB
    const catalogServices = await this.catalogClient.getServices(serviceIds);

    if (catalogServices.length !== serviceIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều dịch vụ đã chọn không tồn tại trong danh mục hệ thống',
      );
    }

    for (const cs of catalogServices) {
      if (!categoryIds.includes(cs.categoryId)) {
        throw new BadRequestException(
          `Dịch vụ "${cs.name}" không thuộc danh mục bạn đã chọn`,
        );
      }
      if (!cs.isActive || !cs.categoryIsActive) {
        throw new BadRequestException(
          `Dịch vụ "${cs.name}" hiện đang tạm ngừng nhận đăng ký`,
        );
      }
    }

    return services.map((svc) => {
      const match = catalogServices.find((cs) => cs.id === svc.serviceId);
      return {
        serviceId: svc.serviceId,
        serviceName: match?.name || '',
        categoryId: match?.categoryId || '',
        categoryName: match?.categoryName || '',
        title: svc.title?.trim() || match?.name || '',
        description: svc.description?.trim() || null,
        experienceYears: svc.experienceYears ?? 0,
      };
    });
  }

  /**
   * Worker nộp hồ sơ đăng ký danh mục, dịch vụ và khu vực làm việc (kèm minh chứng)
   */
  async submitWorkerServiceRegistration(
    userId: string,
    dto: SubmitWorkerRegistrationDto,
    idempotencyKey?: string,
  ) {
    const resolvedKey = idempotencyKey || dto.idempotencyKey;

    let workerProfile = await this.db.workerProfile.findUnique({
      where: { userId },
    });

    if (!workerProfile) {
      workerProfile = await this.db.workerProfile.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          status: 'draft',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    if (resolvedKey) {
      const existing = await this.db.workerServiceRegistration.findUnique({
        where: { idempotencyKey: resolvedKey },
      });
      if (existing) {
        if (existing.workerProfileId !== workerProfile.id) {
          throw new ConflictException(
            'Idempotency-Key đã được sử dụng bởi một tài khoản khác',
          );
        }
        if (!isRegistrationPayloadMatch(existing, dto)) {
          throw new ConflictException(
            'Idempotency-Key đã được sử dụng với nội dung yêu cầu khác (Payload conflict)',
          );
        }
        return {
          statusCode: HttpStatus.OK,
          message:
            'Đơn đăng ký dịch vụ đã được tiếp nhận trước đó (Idempotent)',
          data: existing,
        };
      }
    }

    if (!dto.evidenceFiles || dto.evidenceFiles.length === 0) {
      throw new BadRequestException(
        'Vui lòng cung cấp ít nhất 1 hình ảnh hoặc video minh chứng',
      );
    }

    const enrichedServices = await this.validateAndEnrichServices(
      dto.categoryIds,
      dto.services,
    );

    // Kiểm tra xem thợ đã có đơn đang chờ duyệt (pending) không
    const existingPending = await this.db.workerServiceRegistration.findFirst({
      where: {
        workerProfileId: workerProfile.id,
        status: 'pending',
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'Bạn đã có một đơn đăng ký dịch vụ đang chờ duyệt. Vui lòng sử dụng chức năng cập nhật (PUT) hoặc chờ Admin xử lý.',
      );
    }

    try {
      const created = await this.db.workerServiceRegistration.create({
        data: {
          id: crypto.randomUUID(),
          workerProfileId: workerProfile.id,
          categoryIds: dto.categoryIds as any,
          services: enrichedServices as any,
          serviceArea: dto.serviceArea as any,
          evidenceFiles: dto.evidenceFiles as any,
          status: 'pending',
          idempotencyKey: resolvedKey || crypto.randomUUID(),
        },
      });

      return {
        statusCode: HttpStatus.CREATED,
        message:
          'Nộp đơn đăng ký dịch vụ thành công, vui lòng chờ Admin phê duyệt',
        data: created,
      };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        if (resolvedKey) {
          const duplicate = await this.db.workerServiceRegistration.findUnique({
            where: { idempotencyKey: resolvedKey },
          });
          if (duplicate) {
            if (duplicate.workerProfileId !== workerProfile.id) {
              throw new ConflictException(
                'Idempotency-Key đã được sử dụng bởi một tài khoản khác',
              );
            }
            if (!isRegistrationPayloadMatch(duplicate, dto)) {
              throw new ConflictException(
                'Idempotency-Key đã được sử dụng với nội dung yêu cầu khác (Payload conflict)',
              );
            }
            return {
              statusCode: HttpStatus.OK,
              message:
                'Đơn đăng ký dịch vụ đã được tiếp nhận trước đó (Idempotent)',
              data: duplicate,
            };
          }
        }
        const pendingRecord =
          await this.db.workerServiceRegistration.findFirst({
            where: {
              workerProfileId: workerProfile.id,
              status: 'pending',
            },
          });
        if (pendingRecord) {
          if (!isRegistrationPayloadMatch(pendingRecord, dto)) {
            throw new ConflictException(
              'Bạn đã có một đơn đăng ký dịch vụ đang chờ duyệt với nội dung khác.',
            );
          }
          return {
            statusCode: HttpStatus.OK,
            message:
              'Đơn đăng ký dịch vụ đã được tiếp nhận trước đó (Idempotent)',
            data: pendingRecord,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Worker cập nhật đơn đăng ký dịch vụ (hoặc nộp lại đơn mới từ đơn đã bị từ chối)
   */
  async updateWorkerServiceRegistration(
    userId: string,
    registrationId: string,
    dto: SubmitWorkerRegistrationDto,
    idempotencyKey?: string,
  ) {
    const resolvedKey = idempotencyKey || dto.idempotencyKey;

    const workerProfile = await this.db.workerProfile.findUnique({
      where: { userId },
    });

    if (!workerProfile) {
      throw new NotFoundException('Không tìm thấy hồ sơ thợ của bạn');
    }

    if (resolvedKey) {
      const existing = await this.db.workerServiceRegistration.findUnique({
        where: { idempotencyKey: resolvedKey },
      });
      if (existing) {
        if (existing.workerProfileId !== workerProfile.id) {
          throw new ConflictException(
            'Idempotency-Key đã được sử dụng bởi một tài khoản khác',
          );
        }
        if (!isRegistrationPayloadMatch(existing, dto)) {
          throw new ConflictException(
            'Idempotency-Key đã được sử dụng với nội dung yêu cầu khác (Payload conflict)',
          );
        }
        return {
          statusCode: HttpStatus.OK,
          message:
            'Đơn đăng ký dịch vụ đã được tiếp nhận trước đó (Idempotent)',
          data: existing,
        };
      }
    }

    const registration = await this.db.workerServiceRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration || registration.workerProfileId !== workerProfile.id) {
      throw new NotFoundException('Không tìm thấy đơn đăng ký dịch vụ của bạn');
    }

    if (registration.status === 'approved') {
      throw new BadRequestException(
        'Đơn đăng ký này đã được phê duyệt, không thể chỉnh sửa. Nếu muốn đăng ký thêm dịch vụ, vui lòng nộp đơn mới.',
      );
    }

    if (!dto.evidenceFiles || dto.evidenceFiles.length === 0) {
      throw new BadRequestException(
        'Vui lòng cung cấp ít nhất 1 hình ảnh hoặc video minh chứng',
      );
    }

    const enrichedServices = await this.validateAndEnrichServices(
      dto.categoryIds,
      dto.services,
    );

    // TRƯỜNG HỢP 1: Đơn đang chờ duyệt (pending) -> Cập nhật trực tiếp đơn đó
    if (registration.status === 'pending') {
      const updated = await this.db.workerServiceRegistration.update({
        where: { id: registration.id },
        data: {
          categoryIds: dto.categoryIds,
          services: enrichedServices,
          serviceArea: dto.serviceArea as any,
          evidenceFiles: dto.evidenceFiles as any,
          idempotencyKey: resolvedKey || registration.idempotencyKey,
          updatedAt: new Date(),
        },
      });

      return {
        statusCode: HttpStatus.OK,
        message: 'Cập nhật đơn đăng ký dịch vụ thành công, đang chờ Admin duyệt',
        data: updated,
      };
    }

    // TRƯỜNG HỢP 2: Đơn đã bị từ chối (rejected) -> Theo Hướng A: Tạo đơn mới (pending), giữ nguyên đơn cũ làm lịch sử đối soát
    try {
      const created = await this.db.workerServiceRegistration.create({
        data: {
          id: crypto.randomUUID(),
          workerProfileId: workerProfile.id,
          categoryIds: dto.categoryIds as any,
          services: enrichedServices as any,
          serviceArea: dto.serviceArea as any,
          evidenceFiles: dto.evidenceFiles as any,
          status: 'pending',
          idempotencyKey: resolvedKey || crypto.randomUUID(),
        },
      });

      return {
        statusCode: HttpStatus.CREATED,
        message:
          'Nộp lại đơn đăng ký thành công! Đơn mới đang chờ Admin duyệt, lịch sử đơn cũ được lưu giữ.',
        data: created,
      };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        if (resolvedKey) {
          const duplicate = await this.db.workerServiceRegistration.findUnique({
            where: { idempotencyKey: resolvedKey },
          });
          if (duplicate) {
            if (duplicate.workerProfileId !== workerProfile.id) {
              throw new ConflictException(
                'Idempotency-Key đã được sử dụng bởi một tài khoản khác',
              );
            }
            if (!isRegistrationPayloadMatch(duplicate, dto)) {
              throw new ConflictException(
                'Idempotency-Key đã được sử dụng với nội dung yêu cầu khác (Payload conflict)',
              );
            }
            return {
              statusCode: HttpStatus.OK,
              message:
                'Đơn đăng ký dịch vụ đã được tiếp nhận trước đó (Idempotent)',
              data: duplicate,
            };
          }
        }
        const pendingRecord =
          await this.db.workerServiceRegistration.findFirst({
            where: {
              workerProfileId: workerProfile.id,
              status: 'pending',
            },
          });
        if (pendingRecord) {
          if (!isRegistrationPayloadMatch(pendingRecord, dto)) {
            throw new ConflictException(
              'Bạn đã có một đơn đăng ký dịch vụ đang chờ duyệt với nội dung khác.',
            );
          }
          return {
            statusCode: HttpStatus.OK,
            message:
              'Đơn đăng ký dịch vụ đã được tiếp nhận trước đó (Idempotent)',
            data: pendingRecord,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Worker lấy danh sách các đơn đăng ký dịch vụ của mình
   */
  async getMyServiceRegistrations(userId: string) {
    const workerProfile = await this.db.workerProfile.findUnique({
      where: { userId },
    });

    if (!workerProfile) {
      return {
        statusCode: HttpStatus.OK,
        data: [],
      };
    }

    const registrations = await this.db.workerServiceRegistration.findMany({
      where: { workerProfileId: workerProfile.id },
      orderBy: { createdAt: 'desc' },
    });

    // Ẩn các đơn thợ đã chủ động hủy khỏi danh sách hiển thị của thợ
    const visibleRegistrations = registrations.filter(
      (r) => !r.rejectionReason?.includes('hủy'),
    );

    return {
      statusCode: HttpStatus.OK,
      data: visibleRegistrations,
    };
  }

  /**
   * Worker hủy đơn đăng ký dịch vụ đang chờ duyệt
   */
  async cancelWorkerServiceRegistration(userId: string, registrationId: string) {
    const workerProfile = await this.db.workerProfile.findUnique({
      where: { userId },
    });

    if (!workerProfile) {
      throw new NotFoundException('Không tìm thấy hồ sơ thợ của bạn');
    }

    const registration = await this.db.workerServiceRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration || registration.workerProfileId !== workerProfile.id) {
      throw new NotFoundException('Không tìm thấy đơn đăng ký dịch vụ của bạn');
    }

    if (registration.status !== 'pending') {
      throw new BadRequestException(
        'Chỉ có thể hủy đơn đăng ký đang chờ phê duyệt',
      );
    }

    const updated = await this.db.workerServiceRegistration.updateMany({
      where: {
        id: registrationId,
        workerProfileId: workerProfile.id,
        status: 'pending',
      },
      data: {
        status: 'rejected',
        rejectionReason: '[Thợ chủ động hủy yêu cầu]',
        updatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException(
        'Đơn đăng ký không còn ở trạng thái chờ duyệt hoặc đã được xử lý',
      );
    }

    const current = await this.db.workerServiceRegistration.findUnique({
      where: { id: registrationId },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Hủy đơn đăng ký dịch vụ thành công',
      data: current,
    };
  }

  /**
   * Thợ cập nhật hoặc đảo trạng thái hoạt động (bật/tắt) của một dịch vụ đã duyệt
   */
  async updateServiceOffering(
    userId: string,
    offeringId: string,
    isActive?: boolean,
  ): Promise<unknown> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        offeringId,
      );
    if (!isUuid) {
      throw new BadRequestException(
        'Mã định danh dịch vụ không đúng định dạng UUID',
      );
    }

    const workerProfile = await this.db.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) {
      throw new NotFoundException('Hồ sơ thợ không tồn tại');
    }

    const offering = await this.db.workerServiceOffering.findUnique({
      where: { id: offeringId },
    });
    if (!offering || offering.workerProfileId !== workerProfile.id) {
      throw new NotFoundException(
        'Dịch vụ nghiệp vụ không tồn tại hoặc không thuộc quyền sở hữu của bạn',
      );
    }

    const nextActive =
      typeof isActive === 'boolean' ? isActive : !offering.isActive;

    const updated = await this.db.workerServiceOffering.update({
      where: { id: offeringId },
      data: {
        isActive: nextActive,
        updatedAt: new Date(),
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: nextActive
        ? 'Đã kích hoạt dịch vụ thành công'
        : 'Đã tạm dừng dịch vụ thành công',
      data: {
        id: updated.id,
        serviceId: updated.serviceId,
        isActive: updated.isActive,
        title: updated.title,
        updatedAt: updated.updatedAt,
      },
    };
  }

  /**
   * Admin lấy danh sách các đơn đăng ký dịch vụ của thợ (phân trang, lọc status, search)
   */
  async listAdminServiceRegistrations(query: ListWorkerRegistrationsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        {
          workerProfile: {
            user: {
              fullName: { contains: s, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.db.workerServiceRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: query.sortBy === 'oldest' ? 'asc' : 'desc' },
        include: {
          workerProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true,
                  status: true,
                },
              },
            },
          },
          reviewer: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.db.workerServiceRegistration.count({ where }),
    ]);

    const mapped = items.map((item) => ({
      id: item.id,
      workerProfileId: item.workerProfileId,
      worker: {
        userId: item.workerProfile.user.id,
        fullName: item.workerProfile.user.fullName,
        avatarUrl: item.workerProfile.user.avatarUrl,
        status: item.workerProfile.user.status,
      },
      categoryIds: item.categoryIds,
      services: item.services,
      serviceArea: item.serviceArea,
      evidenceFiles: item.evidenceFiles,
      status: item.status,
      rejectionReason: item.rejectionReason,
      reviewedAt: item.reviewedAt,
      reviewer: item.reviewer,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return {
      statusCode: HttpStatus.OK,
      data: mapped,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin xem chi tiết 1 đơn đăng ký dịch vụ của thợ
   */
  async getAdminServiceRegistrationDetail(registrationId: string) {
    const registration = await this.db.workerServiceRegistration.findUnique({
      where: { id: registrationId },
      include: {
        workerProfile: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        reviewer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException(
        `Không tìm thấy đơn đăng ký dịch vụ với ID: ${registrationId}`,
      );
    }

    return {
      statusCode: HttpStatus.OK,
      data: {
        id: registration.id,
        workerProfileId: registration.workerProfileId,
        worker: {
          userId: registration.workerProfile.user.id,
          fullName: registration.workerProfile.user.fullName,
          avatarUrl: registration.workerProfile.user.avatarUrl,
          status: registration.workerProfile.user.status,
          joinedAt: registration.workerProfile.user.createdAt,
        },
        categoryIds: registration.categoryIds,
        services: registration.services,
        serviceArea: registration.serviceArea,
        evidenceFiles: registration.evidenceFiles,
        status: registration.status,
        rejectionReason: registration.rejectionReason,
        reviewedAt: registration.reviewedAt,
        reviewer: registration.reviewer,
        createdAt: registration.createdAt,
        updatedAt: registration.updatedAt,
      },
    };
  }

  /**
   * Admin duyệt hoặc từ chối đơn đăng ký dịch vụ của thợ
   */
  async reviewServiceRegistration(
    adminUserId: string,
    registrationId: string,
    dto: ReviewWorkerRegistrationDto,
  ) {
    const registration = await this.db.workerServiceRegistration.findUnique({
      where: { id: registrationId },
      include: {
        workerProfile: true,
      },
    });

    if (!registration) {
      throw new NotFoundException(
        `Không tìm thấy đơn đăng ký dịch vụ với ID: ${registrationId}`,
      );
    }

    if (registration.status !== 'pending') {
      throw new ConflictException(
        `Đơn đăng ký không ở trạng thái chờ duyệt (trạng thái hiện tại: ${registration.status})`,
      );
    }

    const now = new Date();

    let reviewerId: string | null = null;
    if (adminUserId) {
      const adminExists = await this.db.user.findUnique({
        where: { id: adminUserId },
        select: { id: true },
      });
      if (adminExists) {
        reviewerId = adminUserId;
      } else {
        this.logger.warn(
          `Admin user ${adminUserId} not found in user-trust users table; leaving reviewedByUserId as null`,
        );
      }
    }

    if (dto.decision === 'approved') {
      await this.db.$transaction(async (tx) => {
        // 1. Cập nhật trạng thái đơn đăng ký nguyên tử (conditional update)
        const updateResult = await tx.workerServiceRegistration.updateMany({
          where: { id: registrationId, status: 'pending' },
          data: {
            status: 'approved',
            rejectionReason: null,
            reviewedByUserId: reviewerId,
            reviewedAt: now,
            updatedAt: now,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            'Đơn đăng ký đã được xử lý hoặc đã bị hủy bởi thợ',
          );
        }

        // 2. Kích hoạt/upsert các dịch vụ vào worker_service_offerings
        const services = Array.isArray(registration.services)
          ? (registration.services as any[])
          : [];

        for (const svc of services) {
          if (!svc.serviceId) continue;
          await tx.workerServiceOffering.upsert({
            where: {
              workerProfileId_serviceId: {
                workerProfileId: registration.workerProfileId,
                serviceId: svc.serviceId,
              },
            },
            create: {
              id: crypto.randomUUID(),
              workerProfileId: registration.workerProfileId,
              serviceId: svc.serviceId,
              title: svc.title || svc.serviceName || null,
              description: svc.description || null,
              experienceYears: Number(svc.experienceYears) || 0,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            },
            update: {
              title: svc.title || svc.serviceName || undefined,
              description:
                svc.description !== undefined ? svc.description : undefined,
              experienceYears:
                svc.experienceYears !== undefined
                  ? Number(svc.experienceYears)
                  : undefined,
              isActive: true,
              updatedAt: now,
            },
          });
        }

        // 3. Kích hoạt khu vực làm việc vào worker_service_areas
        const area = registration.serviceArea as any;
        if (
          area &&
          area.latitude !== undefined &&
          area.longitude !== undefined
        ) {
          await tx.workerServiceArea.updateMany({
            where: {
              workerProfileId: registration.workerProfileId,
              isActive: true,
            },
            data: { isActive: false },
          });

          await tx.workerServiceArea.create({
            data: {
              id: crypto.randomUUID(),
              workerProfileId: registration.workerProfileId,
              address: area.address || null,
              latitude: new Prisma.Decimal(area.latitude),
              longitude: new Prisma.Decimal(area.longitude),
              radiusKm: new Prisma.Decimal(area.radiusKm || 15),
              isActive: true,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      });

      return {
        statusCode: HttpStatus.OK,
        message:
          'Phê duyệt đơn đăng ký thành công! Dịch vụ và khu vực làm việc của thợ đã được kích hoạt',
        data: {
          id: registrationId,
          status: 'approved',
        },
      };
    }

    // Từ chối (rejected)
    const updateResult = await this.db.workerServiceRegistration.updateMany({
      where: { id: registrationId, status: 'pending' },
      data: {
        status: 'rejected',
        rejectionReason: dto.reason || 'Hồ sơ chưa đạt yêu cầu của hệ thống',
        reviewedByUserId: reviewerId,
        reviewedAt: now,
        updatedAt: now,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'Đơn đăng ký đã được xử lý hoặc đã bị hủy bởi thợ',
      );
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Đã từ chối đơn đăng ký dịch vụ của thợ',
      data: {
        id: registrationId,
        status: 'rejected',
        reason: dto.reason,
      },
    };
  }

  /**
   * API Geocoding: Lấy tọa độ lat, long từ địa chỉ
   */
  async geocodeAddress(address: string) {
    if (!address || !address.trim()) {
      throw new BadRequestException('Vui lòng cung cấp địa chỉ để lấy tọa độ');
    }
    const cleanAddress = address.trim();

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        cleanAddress,
      )}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HandyGo-App/1.0 (contact@handygo.vn)' },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data) && data.length > 0) {
          return {
            statusCode: HttpStatus.OK,
            data: {
              address: cleanAddress,
              latitude: parseFloat(data[0].lat),
              longitude: parseFloat(data[0].lon),
              displayName: data[0].display_name,
            },
          };
        }
      }
    } catch (err) {
      this.logger.warn(`Nominatim geocoding error: ${(err as Error).message}`);
    }

    throw new NotFoundException(
      'Không tìm thấy tọa độ cho địa chỉ được cung cấp. Vui lòng kiểm tra lại địa chỉ hoặc nhập chi tiết hơn.',
    );
  }

  /**
   * Upload file minh chứng hình ảnh lên Cloudinary
   */
  async uploadEvidenceFile(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh minh chứng');
    }
    if (!this.cloudinaryService) {
      throw new BadRequestException('Dịch vụ Cloudinary chưa sẵn sàng');
    }

    const upload = await this.cloudinaryService.uploadImage(file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Tải lên hình ảnh minh chứng thành công',
      data: {
        url: upload.url,
        fileType: 'image',
        format: upload.format,
        width: upload.width,
        height: upload.height,
        bytes: upload.bytes,
      },
    };
  }

  /**
   * Khởi tạo chữ ký direct upload video lên Cloudinary
   */
  async createEvidenceVideoSignature(dto: {
    fileName?: string;
    mimeType: string;
    fileSize: number;
    checksumSha256?: string;
  }) {
    if (!this.cloudinaryService) {
      throw new BadRequestException('Dịch vụ Cloudinary chưa sẵn sàng');
    }
    const signature =
      await this.cloudinaryService.createVideoUploadSignature({
        fileName: dto.fileName || `evidence-${Date.now()}.mp4`,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        checksumSha256: dto.checksumSha256,
      });
    return {
      statusCode: HttpStatus.OK,
      message: 'Khởi tạo chữ ký tải lên video thành công',
      data: signature,
    };
  }
}
