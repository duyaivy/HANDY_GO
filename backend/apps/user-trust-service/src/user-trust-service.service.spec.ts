import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustPrismaService } from '@app/database';
import { RegisterRole, Role, StandardPermissions } from '@app/auth';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { CatalogClient } from './clients/catalog.client.js';

describe('UserTrustServiceService', () => {
  let service: UserTrustServiceService;
  let dbMock: any;
  let catalogClientMock: any;

  beforeEach(async () => {
    dbMock = {
      eventInbox: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      customerProfile: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      userBankAccount: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      workerProfile: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      workerReview: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      kycCase: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      workerServiceRegistration: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      workerServiceOffering: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      workerServiceArea: {
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (cb) => cb(dbMock)),
    };

    catalogClientMock = {
      getService: vi.fn(),
      getServices: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTrustServiceService,
        { provide: UserTrustPrismaService, useValue: dbMock },
        { provide: CatalogClient, useValue: catalogClientMock },
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

  describe('listUsers', () => {
    it('should return paginated list of users with default params', async () => {
      dbMock.user.count.mockResolvedValue(2);
      dbMock.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          fullName: 'Nguyen Van A',
          avatarUrl: null,
          status: 'active',
          customerProfile: { id: 'cp-1', bio: 'Customer bio', createdAt: new Date() },
          workerProfile: null,
          bankAccounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'user-2',
          fullName: 'Tran Van B',
          avatarUrl: 'https://cdn.com/b.jpg',
          status: 'active',
          customerProfile: null,
          workerProfile: {
            id: 'wp-1',
            status: 'verified',
            averageRating: 5.0,
            ratingCount: 10,
            completedOrderCount: 15,
            orderCountTotal: 15,
          },
          bankAccounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result: any = await service.listUsers({});

      expect(result.statusCode).toBe(200);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].roles).toContain('customer');
      expect(result.data[1].roles).toContain('worker');
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by role=worker and search term', async () => {
      dbMock.user.count.mockResolvedValue(1);
      dbMock.user.findMany.mockResolvedValue([
        {
          id: 'user-2',
          fullName: 'Tran Van B',
          avatarUrl: null,
          status: 'active',
          customerProfile: null,
          workerProfile: { id: 'wp-1', status: 'verified' },
          bankAccounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result: any = await service.listUsers({
        role: 'worker',
        search: 'Tran',
        page: 1,
        limit: 10,
      });

      expect(result.statusCode).toBe(200);
      expect(dbMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workerProfile: { isNot: null },
            fullName: { contains: 'Tran', mode: 'insensitive' },
          }),
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by role=customer and UUID search', async () => {
      dbMock.user.count.mockResolvedValue(1);
      dbMock.user.findMany.mockResolvedValue([]);

      const testUuid = '11111111-2222-3333-4444-555555555555';
      await service.listUsers({
        role: 'customer',
        search: testUuid,
      });

      expect(dbMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerProfile: { isNot: null },
            OR: [
              { id: testUuid },
              { fullName: { contains: testUuid, mode: 'insensitive' } },
            ],
          }),
        }),
      );
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

    it('should update avatarUrl and bio in customerProfile', async () => {
      dbMock.user.findUnique.mockResolvedValue({ id: 'user-001' });
      dbMock.customerProfile.upsert.mockResolvedValue({ id: 'cp-1', bio: 'Thợ lành nghề' });
      dbMock.user.update.mockResolvedValue({
        id: 'user-001',
        fullName: 'Nguyen Van A',
        avatarUrl: 'https://cloudinary.com/avatar.jpg',
        customerProfile: { bio: 'Thợ lành nghề' },
      });

      const result: any = await service.updateProfile(
        'user-001',
        'user-001',
        { avatarUrl: 'https://cloudinary.com/avatar.jpg', bio: 'Thợ lành nghề' },
        [StandardPermissions.PROFILE_UPDATE],
      );

      expect(result.statusCode).toBe(200);
      expect(result.data.avatarUrl).toBe('https://cloudinary.com/avatar.jpg');
      expect(result.data.customerProfile.bio).toBe('Thợ lành nghề');
    });

    it('should upload avatar via Cloudinary and save avatarUrl', async () => {
      const cloudinaryMock = {
        uploadImage: vi.fn().mockResolvedValue({
          url: 'https://cloudinary.com/uploaded.jpg',
          publicId: 'pid-1',
          format: 'jpg',
          bytes: 1024,
        }),
      };
      (service as any).cloudinaryService = cloudinaryMock;

      dbMock.user.findUnique.mockResolvedValue({ id: 'user-001' });
      dbMock.user.update.mockResolvedValue({
        id: 'user-001',
        fullName: 'Nguyen Van A',
        avatarUrl: 'https://cloudinary.com/uploaded.jpg',
      });

      const fakeFile = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as any;
      const result: any = await service.uploadAvatar('user-001', fakeFile);

      expect(result.statusCode).toBe(200);
      expect(result.data.avatarUrl).toBe('https://cloudinary.com/uploaded.jpg');
      expect(cloudinaryMock.uploadImage).toHaveBeenCalledWith(fakeFile);
    });

    it('should manage bank accounts (get, add, delete)', async () => {
      dbMock.userBankAccount.findMany.mockResolvedValue([
        { id: 'bank-1', bankCode: 'VCB', accountNumber: '123' },
      ]);
      const getResult: any = await service.getBankAccounts('user-001');
      expect(getResult.statusCode).toBe(200);
      expect(getResult.data).toHaveLength(1);

      dbMock.userBankAccount.count.mockResolvedValue(0);
      dbMock.userBankAccount.create.mockResolvedValue({
        id: 'bank-2',
        bankCode: 'MB',
        accountNumber: '456',
        isDefault: true,
      });
      const addResult: any = await service.addBankAccount('user-001', {
        bankCode: 'MB',
        bankName: 'MBBank',
        accountNumber: '456',
        accountHolderName: 'NGUYEN VAN A',
      });
      expect(addResult.statusCode).toBe(201);
      expect(addResult.data.isDefault).toBe(true);

      dbMock.userBankAccount.findFirst.mockResolvedValue({ id: 'bank-2', userId: 'user-001' });
      dbMock.userBankAccount.delete.mockResolvedValue({ id: 'bank-2' });
      const delResult: any = await service.deleteBankAccount('user-001', 'bank-2');
      expect(delResult.statusCode).toBe(200);
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

  describe('getAllActiveUserIds', () => {
    it('should return all active user IDs when targetGroup is ALL or omitted', async () => {
      dbMock.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      const result = await service.getAllActiveUserIds();
      expect(result).toEqual({ userIds: ['user-1', 'user-2'] });
      expect(dbMock.user.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });

    it('should filter by customerProfile when targetGroup is CUSTOMERS', async () => {
      dbMock.user.findMany.mockResolvedValue([{ id: 'cust-1' }]);

      const result = await service.getAllActiveUserIds('CUSTOMERS');
      expect(result).toEqual({ userIds: ['cust-1'] });
      expect(dbMock.user.findMany).toHaveBeenCalledWith({
        where: { status: 'active', customerProfile: { isNot: null } },
        select: { id: true },
      });
    });

    it('should filter by workerProfile when targetGroup is WORKERS', async () => {
      dbMock.user.findMany.mockResolvedValue([{ id: 'work-1' }]);

      const result = await service.getAllActiveUserIds('WORKERS');
      expect(result).toEqual({ userIds: ['work-1'] });
      expect(dbMock.user.findMany).toHaveBeenCalledWith({
        where: { status: 'active', workerProfile: { isNot: null } },
        select: { id: true },
      });
    });
  });

  describe('getWorkerPublicProfile', () => {
    const validWorkerId = '00000000-0000-0000-0000-000000000001';
    const validUserId = '00000000-0000-0000-0000-000000000002';

    it('should throw BadRequestException if worker identifier is not UUID', async () => {
      await expect(service.getWorkerPublicProfile('invalid-uuid')).rejects.toThrow(
        'Mã định danh thợ không đúng định dạng UUID',
      );
    });

    it('should throw NotFoundException if worker not found', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue(null);

      await expect(service.getWorkerPublicProfile(validWorkerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return complete public worker profile with bio, stats, distribution, services, and reviews', async () => {
      const mockWorker = {
        id: validWorkerId,
        userId: validUserId,
        status: 'verified',
        averageRating: 4.85,
        ratingCount: 15,
        completedOrderCount: 20,
        orderCountTotal: 22,
        verifiedAt: new Date('2026-10-01T00:00:00Z'),
        approvedAt: new Date('2026-10-01T00:00:00Z'),
        createdAt: new Date('2026-09-01T00:00:00Z'),
        user: {
          fullName: 'Trần Thợ Lành Nghề',
          avatarUrl: 'https://example.com/avatar.jpg',
          status: 'active',
          customerProfile: {
            bio: 'Thợ điện nước 10 năm kinh nghiệm, tận tâm, chu đáo.',
          },
        },
        serviceOfferings: [
          {
            id: 'offering-1',
            serviceId: '00000000-0000-0000-0000-000000000010',
            title: 'Sửa điện nước dân dụng',
            description: 'Khắc phục mọi sự cố chập điện, rò rỉ nước',
            experienceYears: 10,
            isActive: true,
          },
        ],
        serviceAreas: [
          {
            id: 'area-1',
            latitude: 10.762622,
            longitude: 106.660172,
            radiusKm: 15,
            isActive: true,
          },
        ],
      };

      dbMock.workerProfile.findFirst.mockResolvedValue(mockWorker);
      dbMock.workerReview.groupBy.mockResolvedValue([
        { rating: 5, _count: { rating: 12 } },
        { rating: 4, _count: { rating: 3 } },
      ]);
      dbMock.workerReview.findMany.mockResolvedValue([
        {
          id: 'review-1',
          orderId: '00000000-0000-0000-0000-000000000050',
          rating: 5,
          attitudeRating: 'good',
          qualityRating: 'excellent',
          speedRating: 'fast',
          comment: 'Thợ đến đúng giờ, làm rất nhiệt tình và sạch sẽ.',
          createdAt: new Date('2026-11-01T00:00:00Z'),
          customer: {
            id: 'cust-1',
            fullName: 'Lê Khách Hàng',
            avatarUrl: null,
          },
        },
      ]);

      const result: any = await service.getWorkerPublicProfile(validWorkerId);

      expect(result.statusCode).toBe(200);
      expect(result.data.id).toBe(validWorkerId);
      expect(result.data.fullName).toBe('Trần Thợ Lành Nghề');
      expect(result.data.bio).toBe('Thợ điện nước 10 năm kinh nghiệm, tận tâm, chu đáo.');
      expect(result.data.isVerified).toBe(true);
      expect(result.data.stats.averageRating).toBe(4.85);
      expect(result.data.stats.ratingDistribution).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 3,
        5: 12,
      });
      expect(result.data.services).toHaveLength(1);
      expect(result.data.services[0].title).toBe('Sửa điện nước dân dụng');
      expect(result.data.recentReviews).toHaveLength(1);
      expect(result.data.recentReviews[0].customer.fullName).toBe('Lê Khách Hàng');
    });
  });

  describe('getWorkerReviews', () => {
    const validWorkerId = '00000000-0000-0000-0000-000000000001';

    it('should return paginated worker reviews', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: validWorkerId,
        userId: 'user-w1',
      });

      dbMock.workerReview.findMany.mockResolvedValue([
        {
          id: 'rev-1',
          orderId: 'order-1',
          rating: 5,
          attitudeRating: 'great',
          qualityRating: 'great',
          speedRating: 'fast',
          comment: 'Rất hài lòng',
          createdAt: new Date(),
          customer: {
            id: 'cust-1',
            fullName: 'Nguyễn Văn A',
            avatarUrl: null,
          },
        },
      ]);
      dbMock.workerReview.count.mockResolvedValue(1);

      const result: any = await service.getWorkerReviews(validWorkerId, {
        page: 1,
        limit: 10,
        rating: 5,
      });

      expect(result.statusCode).toBe(200);
      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(dbMock.workerReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workerUserId: 'user-w1',
            status: 'published',
            rating: 5,
          },
        }),
      );
    });
  });

  describe('Worker Service Registration', () => {
    const workerUserId = 'user-w1';
    const workerProfileId = 'wp-1';
    const categoryId = '0986472e-1728-4731-82b2-ff77a7251326';
    const serviceId = 'a26e3c78-f202-4ec0-a2f9-2462371d05a4';

    const validDto: any = {
      categoryIds: [categoryId],
      services: [
        {
          serviceId,
          title: 'Vệ sinh máy lạnh',
          description: 'Hơn 5 năm kinh nghiệm',
          experienceYears: 5,
        },
      ],
      serviceArea: {
        address: 'Quận Cẩm Lệ, Đà Nẵng',
        latitude: 16.0544,
        longitude: 108.2022,
        radiusKm: 15,
      },
      evidenceFiles: [
        {
          url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          fileType: 'image',
          name: 'Chứng chỉ nghề',
        },
      ],
    };

    it('submitWorkerServiceRegistration successfully creates a pending registration', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        status: 'draft',
      });

      catalogClientMock.getServices.mockResolvedValue([
        {
          id: serviceId,
          name: 'Vệ sinh máy lạnh',
          categoryId,
          categoryName: 'Điện lạnh',
          categoryIsActive: true,
          isActive: true,
        },
      ]);

      dbMock.workerServiceRegistration.findFirst.mockResolvedValue(null);
      dbMock.workerServiceRegistration.create.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        status: 'pending',
      });

      const res = await service.submitWorkerServiceRegistration(workerUserId, validDto);

      expect(res.statusCode).toBe(201);
      expect(dbMock.workerServiceRegistration.create).toHaveBeenCalled();
    });

    it('submitWorkerServiceRegistration throws if catalog services do not match', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
      });

      catalogClientMock.getServices.mockResolvedValue([]); // No catalog service found

      await expect(
        service.submitWorkerServiceRegistration(workerUserId, validDto),
      ).rejects.toThrow('Một hoặc nhiều dịch vụ đã chọn không tồn tại');
    });

    it('submitWorkerServiceRegistration throws ServiceUnavailableException if catalog service fails', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
      });

      catalogClientMock.getServices.mockRejectedValue(
        new ServiceUnavailableException('Catalog unavailable'),
      );

      await expect(
        service.submitWorkerServiceRegistration(workerUserId, validDto),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('submitWorkerServiceRegistration throws ConflictException if worker already has a pending registration', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        status: 'draft',
      });

      catalogClientMock.getServices.mockResolvedValue([
        {
          id: serviceId,
          name: 'Vệ sinh máy lạnh',
          categoryId,
          categoryName: 'Điện lạnh',
          categoryIsActive: true,
          isActive: true,
        },
      ]);

      dbMock.workerServiceRegistration.findFirst.mockResolvedValue({
        id: 'reg-already-pending',
        workerProfileId,
        status: 'pending',
      });

      await expect(
        service.submitWorkerServiceRegistration(workerUserId, validDto),
      ).rejects.toThrow(ConflictException);
    });

    it('getMyServiceRegistrations returns list of registrations and filters out cancelled ones', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
      });
      dbMock.workerServiceRegistration.findMany.mockResolvedValue([
        { id: 'reg-1', status: 'pending', rejectionReason: null },
        { id: 'reg-2', status: 'approved', rejectionReason: null },
        { id: 'reg-3', status: 'rejected', rejectionReason: 'Ảnh mờ không rõ thiết bị' },
        { id: 'reg-4', status: 'rejected', rejectionReason: '[Thợ chủ động hủy yêu cầu]' },
        { id: 'reg-5', status: 'rejected', rejectionReason: 'Admin từ chối do dịch vụ bị hủy từ phía quản trị' },
      ]);

      const res = await service.getMyServiceRegistrations(workerUserId);
      expect(res.statusCode).toBe(200);
      expect(res.data).toHaveLength(4);
      expect(res.data.map((r: any) => r.id)).toEqual(['reg-1', 'reg-2', 'reg-3', 'reg-5']);
      expect(res.data.find((r: any) => r.id === 'reg-4')).toBeUndefined();
    });

    describe('cancelWorkerServiceRegistration', () => {
      it('successfully cancels a pending registration by setting status rejected and reason', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique
          .mockResolvedValueOnce({
            id: 'reg-to-cancel',
            workerProfileId,
            status: 'pending',
          })
          .mockResolvedValueOnce({
            id: 'reg-to-cancel',
            workerProfileId,
            status: 'rejected',
            rejectionReason: '[Thợ chủ động hủy yêu cầu]',
          });

        dbMock.workerServiceRegistration.updateMany.mockResolvedValue({ count: 1 });

        const res = await service.cancelWorkerServiceRegistration(
          workerUserId,
          'reg-to-cancel',
        );

        expect(res.statusCode).toBe(200);
        expect(res.message).toBe('Hủy đơn đăng ký dịch vụ thành công');
        expect(dbMock.workerServiceRegistration.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'reg-to-cancel',
            workerProfileId,
            status: 'pending',
          },
          data: expect.objectContaining({
            status: 'rejected',
            rejectionReason: '[Thợ chủ động hủy yêu cầu]',
          }),
        });
      });

      it('throws ConflictException if concurrent cancel or review occurs (updateMany count 0)', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-to-cancel',
          workerProfileId,
          status: 'pending',
        });

        dbMock.workerServiceRegistration.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.cancelWorkerServiceRegistration(workerUserId, 'reg-to-cancel'),
        ).rejects.toThrow(ConflictException);
      });

      it('throws BadRequestException if registration status is not pending', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-approved',
          workerProfileId,
          status: 'approved',
        });

        await expect(
          service.cancelWorkerServiceRegistration(workerUserId, 'reg-approved'),
        ).rejects.toThrow('Chỉ có thể hủy đơn đăng ký đang chờ phê duyệt');
      });

      it('throws NotFoundException if registration does not belong to the worker', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-other-worker',
          workerProfileId: 'other-profile-id',
          status: 'pending',
        });

        await expect(
          service.cancelWorkerServiceRegistration(workerUserId, 'reg-other-worker'),
        ).rejects.toThrow('Không tìm thấy đơn đăng ký dịch vụ của bạn');
      });
    });

    it('listAdminServiceRegistrations returns paginated list of registrations', async () => {
      dbMock.workerServiceRegistration.findMany.mockResolvedValue([
        {
          id: 'reg-1',
          workerProfileId,
          workerProfile: {
            user: {
              id: workerUserId,
              fullName: 'Nguyễn Thợ',
              avatarUrl: null,
              status: 'active',
            },
          },
          reviewer: null,
          categoryIds: [categoryId],
          services: [],
          serviceArea: {},
          evidenceFiles: [],
          status: 'pending',
          rejectionReason: null,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      dbMock.workerServiceRegistration.count.mockResolvedValue(1);

      const res = await service.listAdminServiceRegistrations({
        page: 1,
        limit: 10,
        status: 'pending',
      });

      expect(res.statusCode).toBe(200);
      expect(res.data).toHaveLength(1);
      expect(res.pagination.total).toBe(1);
    });

    it('getAdminServiceRegistrationDetail returns detail of registration', async () => {
      dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        workerProfile: {
          user: {
            id: workerUserId,
            fullName: 'Nguyễn Thợ',
            avatarUrl: null,
            status: 'active',
            createdAt: new Date(),
          },
        },
        reviewer: null,
        categoryIds: [categoryId],
        services: [],
        serviceArea: {},
        evidenceFiles: [],
        status: 'pending',
        rejectionReason: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.getAdminServiceRegistrationDetail('reg-1');
      expect(res.statusCode).toBe(200);
      expect(res.data.id).toBe('reg-1');
      expect(res.data.worker.fullName).toBe('Nguyễn Thợ');
    });

    it('reviewServiceRegistration approves and activates services and area', async () => {
      dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        status: 'pending',
        services: [
          { serviceId, serviceName: 'Vệ sinh máy lạnh', title: 'Vệ sinh máy lạnh' },
        ],
        serviceArea: {
          address: 'Quận Cẩm Lệ',
          latitude: 16.0544,
          longitude: 108.2022,
          radiusKm: 15,
        },
        workerProfile: {
          status: 'draft',
        },
      });

      dbMock.workerServiceRegistration.updateMany.mockResolvedValue({ count: 1 });
      dbMock.workerServiceOffering.upsert.mockResolvedValue({});
      dbMock.workerServiceArea.updateMany.mockResolvedValue({ count: 1 });
      dbMock.workerServiceArea.create.mockResolvedValue({});
      dbMock.workerProfile.update.mockResolvedValue({});

      const res = await service.reviewServiceRegistration('admin-1', 'reg-1', {
        decision: 'approved',
      });

      expect(res.statusCode).toBe(200);
      expect(res.data.status).toBe('approved');
      expect(dbMock.workerServiceOffering.upsert).toHaveBeenCalled();
      expect(dbMock.workerServiceArea.create).toHaveBeenCalled();
      expect(dbMock.workerProfile.update).not.toHaveBeenCalled();
    });

    it('does not upgrade workerProfile status to verified on service approval (preserves KYC independence)', async () => {
      dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        status: 'pending',
        services: [{ serviceId, serviceName: 'Vệ sinh máy lạnh' }],
        serviceArea: null,
        workerProfile: {
          id: workerProfileId,
          status: 'draft',
        },
      });

      dbMock.workerServiceRegistration.updateMany.mockResolvedValue({ count: 1 });
      dbMock.workerServiceOffering.upsert.mockResolvedValue({});

      await service.reviewServiceRegistration('admin-1', 'reg-1', {
        decision: 'approved',
      });

      expect(dbMock.workerProfile.update).not.toHaveBeenCalled();
    });

    it('reviewServiceRegistration rejects with reason', async () => {
      dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        status: 'pending',
        workerProfile: { status: 'draft' },
      });

      dbMock.workerServiceRegistration.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.reviewServiceRegistration('admin-1', 'reg-1', {
        decision: 'rejected',
        reason: 'Ảnh mờ',
      });

      expect(res.statusCode).toBe(200);
      expect(res.data.status).toBe('rejected');
      expect(res.data.reason).toBe('Ảnh mờ');
    });

    it('throws ConflictException if reviewing a registration that is not pending', async () => {
      dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        status: 'approved',
        workerProfile: { status: 'verified' },
      });

      await expect(
        service.reviewServiceRegistration('admin-1', 'reg-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if concurrent review or cancellation occurs during approve (updateMany count 0)', async () => {
      dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        workerProfileId,
        status: 'pending',
        services: [],
        serviceArea: null,
        workerProfile: { status: 'draft' },
      });

      dbMock.workerServiceRegistration.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reviewServiceRegistration('admin-1', 'reg-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow(ConflictException);
    });

    describe('geocodeAddress', () => {
      it('throws BadRequestException if address is empty', async () => {
        await expect(service.geocodeAddress('')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('returns coordinates when geocoding succeeds', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              lat: '16.0544',
              lon: '108.2022',
              display_name: 'Quận Cẩm Lệ, Đà Nẵng, Việt Nam',
            },
          ],
        } as any);

        const res = await service.geocodeAddress('Quận Cẩm Lệ, Đà Nẵng');
        expect(res.statusCode).toBe(200);
        expect(res.data.latitude).toBe(16.0544);
        expect(res.data.longitude).toBe(108.2022);
        expect(res.data.displayName).toBe('Quận Cẩm Lệ, Đà Nẵng, Việt Nam');
        fetchSpy.mockRestore();
      });

      it('throws NotFoundException when geocoding fails or returns empty array', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as any);

        await expect(
          service.geocodeAddress('Địa chỉ không tồn tại 123456789xyz'),
        ).rejects.toThrow(NotFoundException);
        fetchSpy.mockRestore();
      });
    });

    describe('updateWorkerServiceRegistration', () => {
      it('updates a pending registration directly', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-pending',
          workerProfileId,
          status: 'pending',
        });

        catalogClientMock.getServices.mockResolvedValue([
          {
            id: serviceId,
            name: 'Vệ sinh máy lạnh',
            categoryId,
            categoryName: 'Điện lạnh',
            categoryIsActive: true,
            isActive: true,
          },
        ]);

        dbMock.workerServiceRegistration.update.mockResolvedValue({
          id: 'reg-pending',
          status: 'pending',
        });

        const res = await service.updateWorkerServiceRegistration(
          workerUserId,
          'reg-pending',
          validDto,
        );

        expect(res.statusCode).toBe(200);
        expect(dbMock.workerServiceRegistration.update).toHaveBeenCalled();
      });

      it('creates a new registration if existing registration was rejected (Huong A)', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-rejected',
          workerProfileId,
          status: 'rejected',
          rejectionReason: 'Ảnh mờ',
        });

        catalogClientMock.getServices.mockResolvedValue([
          {
            id: serviceId,
            name: 'Vệ sinh máy lạnh',
            categoryId,
            categoryName: 'Điện lạnh',
            categoryIsActive: true,
            isActive: true,
          },
        ]);

        dbMock.workerServiceRegistration.create.mockResolvedValue({
          id: 'reg-new',
          workerProfileId,
          status: 'pending',
        });

        const res = await service.updateWorkerServiceRegistration(
          workerUserId,
          'reg-rejected',
          validDto,
        );

        expect(res.statusCode).toBe(201);
        expect(dbMock.workerServiceRegistration.create).toHaveBeenCalled();
        expect(res.message).toContain('Nộp lại đơn đăng ký thành công');
      });

      it('throws BadRequestException if registration was already approved', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-approved',
          workerProfileId,
          status: 'approved',
        });

        await expect(
          service.updateWorkerServiceRegistration(
            workerUserId,
            'reg-approved',
            validDto,
          ),
        ).rejects.toThrow('không thể chỉnh sửa');
      });

      it('returns existing registration when idempotencyKey matches (Idempotent update)', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-existing-idempotent',
          workerProfileId,
          status: 'pending',
          idempotencyKey: 'idem-update-key-123',
          categoryIds: [categoryId],
          services: [{ serviceId }],
          serviceArea: { address: 'Quận Cẩm Lệ, Đà Nẵng' },
          evidenceFiles: [
            { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
          ],
        });

        const res = await service.updateWorkerServiceRegistration(
          workerUserId,
          'reg-pending',
          validDto,
          'idem-update-key-123',
        );

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('Idempotent');
        expect(res.data.id).toBe('reg-existing-idempotent');
        expect(dbMock.workerServiceRegistration.update).not.toHaveBeenCalled();
      });
    });

    describe('idempotency in submitWorkerServiceRegistration', () => {
      it('returns existing record when idempotencyKey and payload match for same worker', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
          status: 'draft',
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-existing-submit',
          workerProfileId,
          status: 'pending',
          idempotencyKey: 'idem-submit-key-123',
          categoryIds: [categoryId],
          services: [{ serviceId }],
          serviceArea: { address: 'Quận Cẩm Lệ, Đà Nẵng' },
          evidenceFiles: [
            { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
          ],
        });

        const res = await service.submitWorkerServiceRegistration(
          workerUserId,
          validDto,
          'idem-submit-key-123',
        );

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('Idempotent');
        expect(res.data.id).toBe('reg-existing-submit');
        expect(dbMock.workerServiceRegistration.create).not.toHaveBeenCalled();
      });

      it('throws ConflictException if idempotencyKey belongs to a different worker', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
          status: 'draft',
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-other-worker',
          workerProfileId: 'wp-other-worker',
          status: 'pending',
          idempotencyKey: 'idem-submit-key-123',
          categoryIds: [categoryId],
          services: [{ serviceId }],
          serviceArea: { address: 'Quận Cẩm Lệ, Đà Nẵng' },
          evidenceFiles: [
            { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
          ],
        });

        await expect(
          service.submitWorkerServiceRegistration(
            workerUserId,
            validDto,
            'idem-submit-key-123',
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('throws ConflictException if same idempotencyKey is used with different payload', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
          status: 'draft',
        });

        dbMock.workerServiceRegistration.findUnique.mockResolvedValue({
          id: 'reg-same-worker',
          workerProfileId,
          status: 'pending',
          idempotencyKey: 'idem-submit-key-123',
          categoryIds: ['other-cat-id'],
          services: [{ serviceId: 'other-service-id' }],
          serviceArea: { address: 'Hà Nội' },
          evidenceFiles: [],
        });

        await expect(
          service.submitWorkerServiceRegistration(
            workerUserId,
            validDto,
            'idem-submit-key-123',
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('handles P2002 race condition on concurrent duplicate submit', async () => {
        dbMock.workerProfile.findUnique.mockResolvedValue({
          id: workerProfileId,
          userId: workerUserId,
          status: 'draft',
        });

        catalogClientMock.getServices.mockResolvedValue([
          {
            id: serviceId,
            name: 'Vệ sinh máy lạnh',
            categoryId,
            categoryName: 'Điện lạnh',
            categoryIsActive: true,
            isActive: true,
          },
        ]);

        // findUnique at start returns null (simulate concurrent race condition)
        dbMock.workerServiceRegistration.findUnique
          .mockResolvedValueOnce(null) // initial check
          .mockResolvedValueOnce({
            id: 'reg-race-winner',
            workerProfileId,
            status: 'pending',
            idempotencyKey: 'idem-race-key',
            categoryIds: [categoryId],
            services: [{ serviceId }],
            serviceArea: { address: 'Quận Cẩm Lệ, Đà Nẵng' },
            evidenceFiles: [
              {
                url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
              },
            ],
          }); // check after P2002

        dbMock.workerServiceRegistration.findFirst.mockResolvedValue(null);

        const p2002Error: any = new Error('Unique constraint failed');
        p2002Error.code = 'P2002';
        dbMock.workerServiceRegistration.create.mockRejectedValue(p2002Error);

        const res = await service.submitWorkerServiceRegistration(
          workerUserId,
          validDto,
          'idem-race-key',
        );

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('Idempotent');
        expect(res.data.id).toBe('reg-race-winner');
      });
    });
  });

  describe('updateServiceOffering', () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const workerProfileId = '00000000-0000-0000-0000-000000000002';
    const offeringId = '00000000-0000-0000-0000-000000000003';

    it('should throw BadRequestException if offeringId is not a valid UUID', async () => {
      await expect(
        service.updateServiceOffering(userId, 'invalid-uuid', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if workerProfile not found', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateServiceOffering(userId, offeringId, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if offering not found or belongs to another worker', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({ id: workerProfileId });
      dbMock.workerServiceOffering.findUnique.mockResolvedValue({
        id: offeringId,
        workerProfileId: 'other-worker-id',
      });

      await expect(
        service.updateServiceOffering(userId, offeringId, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update offering isActive to specified value', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({ id: workerProfileId });
      dbMock.workerServiceOffering.findUnique.mockResolvedValue({
        id: offeringId,
        workerProfileId,
        isActive: true,
      });
      dbMock.workerServiceOffering.update.mockResolvedValue({
        id: offeringId,
        serviceId: 's1',
        title: 'Sửa điện',
        isActive: false,
        updatedAt: new Date(),
      });

      const res: any = await service.updateServiceOffering(userId, offeringId, false);

      expect(res.statusCode).toBe(200);
      expect(res.data.isActive).toBe(false);
      expect(dbMock.workerServiceOffering.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offeringId },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('should toggle offering isActive if no boolean provided', async () => {
      dbMock.workerProfile.findUnique.mockResolvedValue({ id: workerProfileId });
      dbMock.workerServiceOffering.findUnique.mockResolvedValue({
        id: offeringId,
        workerProfileId,
        isActive: false,
      });
      dbMock.workerServiceOffering.update.mockResolvedValue({
        id: offeringId,
        serviceId: 's1',
        title: 'Sửa điện',
        isActive: true,
        updatedAt: new Date(),
      });

      const res: any = await service.updateServiceOffering(userId, offeringId);

      expect(res.statusCode).toBe(200);
      expect(res.data.isActive).toBe(true);
      expect(dbMock.workerServiceOffering.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offeringId },
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });
});
