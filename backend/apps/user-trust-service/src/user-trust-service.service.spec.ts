import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustPrismaService } from '@app/database';
import { RegisterRole, Role, StandardPermissions } from '@app/auth';
import { UserTrustServiceService } from './user-trust-service.service.js';

describe('UserTrustServiceService', () => {
  let service: UserTrustServiceService;
  let dbMock: any;

  beforeEach(async () => {
    dbMock = {
      eventInbox: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      customerProfile: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      workerProfile: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      kycCase: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(dbMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTrustServiceService,
        { provide: UserTrustPrismaService, useValue: dbMock },
      ],
    }).compile();

    service = module.get<UserTrustServiceService>(UserTrustServiceService);
  });

  describe('handleUserRegistered', () => {
    const event = {
      eventId: 'evt-001',
      eventVersion: 2,
      occurredAt: new Date(),
      producer: 'auth-service',
      data: {
        userId: 'user-001',
        accountId: 'account-001',
        fullName: 'Nguyen Van A',
        role: RegisterRole.CUSTOMER,
      },
    };

    it('should create user and customer profile when event is received for the first time', async () => {
      dbMock.eventInbox.findUnique.mockResolvedValue(null);
      dbMock.user.findUnique.mockResolvedValue(null);
      dbMock.user.create.mockResolvedValue({ id: 'user-001' });
      dbMock.customerProfile.upsert.mockResolvedValue({ id: 'prof-001' });

      const result = await service.handleUserRegistered(event);

      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(false);
      expect(dbMock.eventInbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'evt-001' }),
        }),
      );
      expect(dbMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'user-001' }),
        }),
      );
      expect(dbMock.customerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-001' },
          create: expect.objectContaining({ userId: 'user-001' }),
        }),
      );
      expect(dbMock.workerProfile.upsert).not.toHaveBeenCalled();
    });

    it('should be idempotent and skip processing if eventId already exists in eventInbox', async () => {
      dbMock.eventInbox.findUnique.mockResolvedValue({ id: 'evt-001' });

      const result = await service.handleUserRegistered(event);

      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(dbMock.eventInbox.create).not.toHaveBeenCalled();
      expect(dbMock.user.create).not.toHaveBeenCalled();
    });

    it('should create both customer and draft worker profiles when eventVersion 3 is received', async () => {
      dbMock.eventInbox.findUnique.mockResolvedValue(null);
      dbMock.user.findUnique.mockResolvedValue(null);
      dbMock.user.create.mockResolvedValue({ id: 'user-unified' });
      dbMock.customerProfile.upsert.mockResolvedValue({ id: 'cust-prof' });
      dbMock.workerProfile.upsert.mockResolvedValue({ id: 'work-prof' });

      const eventV3 = {
        eventId: 'evt-v3-001',
        eventVersion: 3,
        occurredAt: new Date(),
        producer: 'auth-service',
        data: {
          userId: 'user-unified',
          accountId: 'acc-unified',
          fullName: 'Unified User',
          roles: ['Customer', 'Worker'],
        },
      };

      const result = await service.handleUserRegistered(eventV3);

      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(false);
      expect(dbMock.eventInbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'evt-v3-001' }),
        }),
      );
      expect(dbMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'user-unified',
            fullName: 'Unified User',
            status: 'active',
          }),
        }),
      );
      expect(dbMock.customerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-unified' },
          create: expect.objectContaining({ userId: 'user-unified' }),
        }),
      );
      expect(dbMock.workerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-unified' },
          create: expect.objectContaining({
            userId: 'user-unified',
            status: 'draft',
            verifiedAt: null,
          }),
        }),
      );
    });

    it('should be idempotent and skip eventVersion 3 if already in inbox', async () => {
      dbMock.eventInbox.findUnique.mockResolvedValue({ id: 'evt-v3-001' });

      const eventV3 = {
        eventId: 'evt-v3-001',
        eventVersion: 3,
        occurredAt: new Date(),
        producer: 'auth-service',
        data: {
          userId: 'user-unified',
          accountId: 'acc-unified',
          fullName: 'Unified User',
          roles: ['Customer', 'Worker'],
        },
      };

      const result = await service.handleUserRegistered(eventV3);

      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(dbMock.eventInbox.create).not.toHaveBeenCalled();
      expect(dbMock.customerProfile.upsert).not.toHaveBeenCalled();
      expect(dbMock.workerProfile.upsert).not.toHaveBeenCalled();
    });

    it('creates only a draft WorkerProfile for Worker registration', async () => {
      dbMock.eventInbox.findUnique.mockResolvedValue(null);
      dbMock.user.findUnique.mockResolvedValue(null);
      dbMock.user.create.mockResolvedValue({ id: 'user-worker' });

      const result = await service.handleUserRegistered({
        ...event,
        eventId: 'evt-worker',
        data: { ...event.data, userId: 'user-worker', role: RegisterRole.WORKER },
      });

      expect(result.processed).toBe(true);
      expect(dbMock.workerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-worker' },
          create: expect.objectContaining({ userId: 'user-worker', status: 'draft' }),
        }),
      );
      expect(dbMock.customerProfile.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getUserAuthStatus', () => {
    it('should return user status and provisioned flag', async () => {
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-001',
        status: 'active',
        customerProfile: { id: 'prof-001' },
      });

      const result = await service.getUserAuthStatus('user-001', [RegisterRole.CUSTOMER]);
      expect(result).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: true,
      });
    });

    it('should return exists: false when user is not found', async () => {
      dbMock.user.findUnique.mockResolvedValue(null);

      const result = await service.getUserAuthStatus('non-existent', [RegisterRole.CUSTOMER]);
      expect(result).toEqual({
        exists: false,
        status: 'none',
        isProvisioned: false,
      });
    });

    it('checks WorkerProfile rather than CustomerProfile for Worker login', async () => {
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-worker',
        status: 'active',
        customerProfile: null,
        workerProfile: { status: 'draft' },
      });

      expect(await service.getUserAuthStatus('user-worker', [RegisterRole.WORKER])).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: true,
      });
      expect(await service.getUserAuthStatus('user-worker', [RegisterRole.CUSTOMER])).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: false,
      });
    });

    it('allows an Admin user without a Customer or Worker profile', async () => {
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-admin',
        status: 'active',
        customerProfile: null,
        workerProfile: null,
      });

      expect(await service.getUserAuthStatus('user-admin', [Role.ADMIN])).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: true,
      });
      expect(await service.getUserAuthStatus('user-admin', [])).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: false,
      });
    });

    it('requires both customerProfile and workerProfile for unified account with Customer and Worker roles', async () => {
      // 1. Both profiles exist -> isProvisioned: true
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-unified',
        status: 'active',
        customerProfile: { id: 'cust-1' },
        workerProfile: { id: 'work-1', status: 'draft' },
      });

      expect(
        await service.getUserAuthStatus('user-unified', [
          RegisterRole.CUSTOMER,
          RegisterRole.WORKER,
        ]),
      ).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: true,
      });

      // 2. Missing workerProfile -> isProvisioned: false
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-unified',
        status: 'active',
        customerProfile: { id: 'cust-1' },
        workerProfile: null,
      });

      expect(
        await service.getUserAuthStatus('user-unified', [
          RegisterRole.CUSTOMER,
          RegisterRole.WORKER,
        ]),
      ).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: false,
      });

      // 3. Missing customerProfile -> isProvisioned: false
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-unified',
        status: 'active',
        customerProfile: null,
        workerProfile: { id: 'work-1', status: 'draft' },
      });

      expect(
        await service.getUserAuthStatus('user-unified', [
          RegisterRole.CUSTOMER,
          RegisterRole.WORKER,
        ]),
      ).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: false,
      });
    });
  });

  describe('getProfile', () => {
    it('should allow user to read their own profile', async () => {
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-001',
        fullName: 'Nguyen Van A',
        avatarUrl: null,
        customerProfile: { bio: null },
      });

      const result: any = await service.getProfile(
        'user-001',
        'user-001',
        [StandardPermissions.PROFILE_READ],
      );

      expect(result.statusCode).toBe(200);
      expect(result.data.id).toBe('user-001');
      expect(result.data).not.toHaveProperty('phone');
      expect(result.data).not.toHaveProperty('email');
    });

    it('should forbid reading other user profile without user:read permission', async () => {
      await expect(
        service.getProfile('user-001', 'user-002', [StandardPermissions.PROFILE_READ]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin with user:read to view another user profile', async () => {
      dbMock.user.findUnique.mockResolvedValue({
        id: 'user-002',
        fullName: 'Nguyen Van B',
      });

      const result: any = await service.getProfile('admin-001', 'user-002', [
        StandardPermissions.USER_READ,
      ]);

      expect(result.statusCode).toBe(200);
      expect(result.data.id).toBe('user-002');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      dbMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfile('user-001', 'user-001', [StandardPermissions.PROFILE_READ]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should allow user to update their own profile', async () => {
      dbMock.user.findUnique.mockResolvedValue({ id: 'user-001' });
      dbMock.user.update.mockResolvedValue({
        id: 'user-001',
        fullName: 'Nguyen Van New',
      });

      const result: any = await service.updateProfile(
        'user-001',
        'user-001',
        { fullName: 'Nguyen Van New' },
        [StandardPermissions.PROFILE_UPDATE],
      );

      expect(result.statusCode).toBe(200);
      expect(result.data.fullName).toBe('Nguyen Van New');
    });

    it('should forbid updating another user profile without user:manage permission', async () => {
      await expect(
        service.updateProfile(
          'user-001',
          'user-002',
          { fullName: 'Hacked Name' },
          [StandardPermissions.PROFILE_UPDATE],
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('KYC Lifecycle and Database Persistence', () => {
    describe('submitKyc', () => {
      it('should set workerProfile to pending_kyc and create kycCase with status submitted', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({ id: 'wp-001', status: 'draft' });
        dbMock.workerProfile.update.mockResolvedValue({ id: 'wp-001', status: 'pending_kyc' });
        dbMock.kycCase.create.mockResolvedValue({
          id: 'kyc-001',
          workerProfileId: 'wp-001',
          status: 'submitted',
        });

        const res: any = await service.submitKyc('user-001', {
          idDocumentType: 'CCCD',
          idNumber: '012345678901',
          documentFrontRef: 'https://cloudinary.com/front.jpg',
          selfieRef: 'https://cloudinary.com/selfie.jpg',
        });

        expect(res.statusCode).toBe(201);
        expect(dbMock.workerProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'pending_kyc' }),
          }),
        );
        expect(dbMock.kycCase.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'submitted',
              idDocumentType: 'CCCD',
              idNumberMasked: '012******901',
              documentFrontRef: 'https://cloudinary.com/front.jpg',
              selfieRef: 'https://cloudinary.com/selfie.jpg',
            }),
          }),
        );
      });
    });

    describe('handleKycPending', () => {
      it('should transition workerProfile to pending_kyc and record submitted kycCase', async () => {
        dbMock.eventInbox.findUnique.mockResolvedValue(null);
        dbMock.workerProfile.findUnique.mockResolvedValue({ id: 'wp-001', status: 'draft' });
        dbMock.workerProfile.update.mockResolvedValue({ id: 'wp-001', status: 'pending_kyc' });
        dbMock.kycCase.findFirst.mockResolvedValue(null);
        dbMock.kycCase.create.mockResolvedValue({ id: 'kyc-001', status: 'submitted' });

        const result = await service.handleKycPending({
          eventId: 'evt-pend-1',
          producer: 'ai-service',
          data: { userId: 'user-001', jobId: 'job-1' },
        } as any);

        expect(result.processed).toBe(true);
        expect(dbMock.workerProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'pending_kyc' }),
          }),
        );
        expect(dbMock.kycCase.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'submitted' }),
          }),
        );
      });
    });

    describe('handleKycSubmitted', () => {
      it('should transition workerProfile to under_review and kycCase to reviewing with OCR and similarity score', async () => {
        dbMock.eventInbox.findUnique.mockResolvedValue(null);
        dbMock.workerProfile.findUnique.mockResolvedValue({ id: 'wp-001', status: 'pending_kyc' });
        dbMock.workerProfile.update.mockResolvedValue({ id: 'wp-001', status: 'under_review' });
        dbMock.kycCase.findFirst.mockResolvedValue({
          id: 'kyc-001',
          workerProfileId: 'wp-001',
          status: 'submitted',
          documentFrontRef: '',
          selfieRef: '',
        });
        dbMock.kycCase.update.mockResolvedValue({
          id: 'kyc-001',
          status: 'reviewing',
        });

        const result = await service.handleKycSubmitted({
          eventId: 'evt-sub-1',
          producer: 'ai-service',
          data: {
            userId: 'user-001',
            ocr: { id: '079201001234' },
            faceVerification: {
              similarity: 0.92,
              cropfromCCCD: 'https://cloudinary.com/crop.jpg',
              selfie_image: 'https://cloudinary.com/selfie.jpg',
            },
          },
        } as any);

        expect(result.processed).toBe(true);
        expect(dbMock.workerProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'under_review' }),
          }),
        );
        expect(dbMock.kycCase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'kyc-001' },
            data: expect.objectContaining({
              status: 'reviewing',
              idNumberMasked: '079******234',
              documentFrontRef: 'https://cloudinary.com/crop.jpg',
              selfieRef: 'https://cloudinary.com/selfie.jpg',
              aiSimilarityScore: 0.92,
            }),
          }),
        );
      });
    });

    describe('handleKycFailed', () => {
      it('should transition workerProfile to rejected and update kycCase to rejected with reason', async () => {
        dbMock.eventInbox.findUnique.mockResolvedValue(null);
        dbMock.workerProfile.findUnique.mockResolvedValue({ id: 'wp-001', status: 'under_review' });
        dbMock.workerProfile.update.mockResolvedValue({ id: 'wp-001', status: 'rejected' });
        dbMock.kycCase.findFirst.mockResolvedValue({
          id: 'kyc-001',
          status: 'reviewing',
        });
        dbMock.kycCase.update.mockResolvedValue({ id: 'kyc-001', status: 'rejected' });

        const result = await service.handleKycFailed({
          eventId: 'evt-fail-1',
          producer: 'ai-service',
          data: {
            userId: 'user-001',
            reason: 'Khuôn mặt không khớp với ảnh trên thẻ CCCD.',
            similarity: 0.35,
          },
        } as any);

        expect(result.processed).toBe(true);
        expect(dbMock.workerProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'rejected' }),
          }),
        );
        expect(dbMock.kycCase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'rejected',
              reviewNote: 'Khuôn mặt không khớp với ảnh trên thẻ CCCD.',
              aiSimilarityScore: 0.35,
            }),
          }),
        );
      });
    });

    describe('reviewKycCase', () => {
      it('should approve kycCase and set workerProfile to verified with timestamps', async () => {
        dbMock.kycCase.findUnique.mockResolvedValue({
          id: 'kyc-001',
          workerProfileId: 'wp-001',
          status: 'reviewing',
        });
        dbMock.kycCase.update.mockResolvedValue({
          id: 'kyc-001',
          status: 'approved',
        });
        dbMock.workerProfile.update.mockResolvedValue({
          id: 'wp-001',
          status: 'verified',
        });

        const res = await service.reviewKycCase(
          'admin-001',
          'kyc-001',
          'approved',
          'Hồ sơ hợp lệ',
        );

        expect(res.statusCode).toBe(200);
        expect(dbMock.kycCase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'approved',
              reviewedByUserId: 'admin-001',
              reviewNote: 'Hồ sơ hợp lệ',
            }),
          }),
        );
        expect(dbMock.workerProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'verified',
            }),
          }),
        );
      });

      it('should reject kycCase and set workerProfile to rejected', async () => {
        dbMock.kycCase.findUnique.mockResolvedValue({
          id: 'kyc-001',
          workerProfileId: 'wp-001',
          status: 'reviewing',
        });
        dbMock.kycCase.update.mockResolvedValue({
          id: 'kyc-001',
          status: 'rejected',
        });
        dbMock.workerProfile.update.mockResolvedValue({
          id: 'wp-001',
          status: 'rejected',
        });

        const res = await service.reviewKycCase(
          'admin-001',
          'kyc-001',
          'rejected',
          'Ảnh mờ, không đọc được số CCCD',
        );

        expect(res.statusCode).toBe(200);
        expect(dbMock.kycCase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'rejected',
              reviewedByUserId: 'admin-001',
              reviewNote: 'Ảnh mờ, không đọc được số CCCD',
            }),
          }),
        );
        expect(dbMock.workerProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'rejected',
            }),
          }),
        );
      });
    });
  });
});
