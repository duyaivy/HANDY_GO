import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustPrismaService } from '@app/database';
import { StandardPermissions } from '@app/auth';
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
        upsert: vi.fn(),
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
        role: 'Customer' as const,
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

    it('creates only a draft WorkerProfile for Worker registration', async () => {
      dbMock.eventInbox.findUnique.mockResolvedValue(null);
      dbMock.user.findUnique.mockResolvedValue(null);
      dbMock.user.create.mockResolvedValue({ id: 'user-worker' });

      const result = await service.handleUserRegistered({
        ...event,
        eventId: 'evt-worker',
        data: { ...event.data, userId: 'user-worker', role: 'Worker' },
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

      const result = await service.getUserAuthStatus('user-001', ['Customer']);
      expect(result).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: true,
      });
    });

    it('should return exists: false when user is not found', async () => {
      dbMock.user.findUnique.mockResolvedValue(null);

      const result = await service.getUserAuthStatus('non-existent', ['Customer']);
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

      expect(await service.getUserAuthStatus('user-worker', ['Worker'])).toEqual({
        exists: true,
        status: 'active',
        isProvisioned: true,
      });
      expect(await service.getUserAuthStatus('user-worker', ['Customer'])).toEqual({
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

      expect(await service.getUserAuthStatus('user-admin', ['Admin'])).toEqual({
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
});
