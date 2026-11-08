import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { RegisterRole, TokenVerifierService } from '@app/auth';
import { ConfigService } from '@app/config';

describe('UserTrustServiceController', () => {
  let controller: UserTrustServiceController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getHello: vi.fn().mockReturnValue('Hello World!'),
      handleUserRegistered: vi.fn().mockResolvedValue({ processed: true }),
      getProfile: vi.fn().mockResolvedValue({ statusCode: 200 }),
      updateProfile: vi.fn().mockResolvedValue({ statusCode: 200 }),
      listUsers: vi.fn().mockResolvedValue({ statusCode: 200, data: [], pagination: {} }),
      uploadAvatar: vi.fn().mockResolvedValue({ statusCode: 200 }),
      getBankAccounts: vi.fn().mockResolvedValue({ statusCode: 200 }),
      addBankAccount: vi.fn().mockResolvedValue({ statusCode: 201 }),
      deleteBankAccount: vi.fn().mockResolvedValue({ statusCode: 200 }),
      getWorkerPublicProfile: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'w1' } }),
      getWorkerReviews: vi.fn().mockResolvedValue({ statusCode: 200, data: [], pagination: {} }),
      submitWorkerServiceRegistration: vi.fn().mockResolvedValue({ statusCode: 201, data: { id: 'reg-1' } }),
      updateWorkerServiceRegistration: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'reg-1' } }),
      getMyServiceRegistrations: vi.fn().mockResolvedValue({ statusCode: 200, data: [] }),
      listAdminServiceRegistrations: vi.fn().mockResolvedValue({ statusCode: 200, data: [], pagination: {} }),
      getAdminServiceRegistrationDetail: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'reg-1' } }),
      reviewServiceRegistration: vi.fn().mockResolvedValue({ statusCode: 200, data: { status: 'approved' } }),
      geocodeAddress: vi.fn().mockResolvedValue({ statusCode: 200, data: { latitude: 16.0544, longitude: 108.2022 } }),
      updateServiceOffering: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'offering-1', isActive: true } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserTrustServiceController],
      providers: [
        { provide: UserTrustServiceService, useValue: serviceMock },
        { provide: TokenVerifierService, useValue: { verifyAccessToken: vi.fn() } },
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'secret-1' },
        },
      ],
    }).compile();

    controller = module.get<UserTrustServiceController>(
      UserTrustServiceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle user.registered domain event via RabbitMQ handler', async () => {
    const event = {
      eventId: 'evt-1',
      producer: 'auth-service',
      data: {
        userId: 'user-1',
        accountId: 'acc-1',
        fullName: 'Test User',
        phone: '+84912345678',
        email: 'test@example.com',
      },
    } as any;

    const result = await controller.handleUserRegistered(event, undefined as any);
    expect(result).toEqual({ processed: true });
    expect(serviceMock.handleUserRegistered).toHaveBeenCalledWith(event);
  });

  it('should return profile for authenticated user', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:read'],
    };

    const result = await controller.getMyProfile(user);
    expect(result).toEqual({ statusCode: 200 });
    expect(serviceMock.getProfile).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ['profile:read'],
    );
  });

  it('should update profile and handle avatar upload via updateMyProfile', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:update'],
    };

    const result = await controller.updateMyProfile(user, { fullName: 'Updated Name' });
    expect(result).toEqual({ statusCode: 200 });
    expect(serviceMock.updateProfile).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      { fullName: 'Updated Name' },
      ['profile:update'],
    );
  });

  it('should upload avatar via uploadMyAvatar', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:update'],
    };

    const fakeFile = { buffer: Buffer.from('img') } as any;
    const result = await controller.uploadMyAvatar(user, { file: [fakeFile] });
    expect(result).toEqual({ statusCode: 200 });
    expect(serviceMock.uploadAvatar).toHaveBeenCalledWith('user-1', fakeFile);
  });

  it('should delegate bank account requests to service', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:read', 'profile:update'],
    };

    await controller.getMyBankAccounts(user);
    expect(serviceMock.getBankAccounts).toHaveBeenCalledWith('user-1');

    await controller.addMyBankAccount(user, {
      bankCode: 'VCB',
      bankName: 'Vietcombank',
      accountNumber: '123',
      accountHolderName: 'NGUYEN A',
    });
    expect(serviceMock.addBankAccount).toHaveBeenCalledWith('user-1', expect.objectContaining({ bankCode: 'VCB' }));

    await controller.deleteMyBankAccount(user, 'bank-1');
    expect(serviceMock.deleteBankAccount).toHaveBeenCalledWith('user-1', 'bank-1');
  });

  it('should call service.listUsers for admin list users', async () => {
    const query = { page: 1, limit: 10, search: 'test', role: 'customer' as const };
    const result = await controller.listUsers(query);
    expect(result).toEqual({ statusCode: 200, data: [], pagination: {} });
    expect(serviceMock.listUsers).toHaveBeenCalledWith(query);

    const adminResult = await controller.listAdminUsers(query);
    expect(adminResult).toEqual({ statusCode: 200, data: [], pagination: {} });
  });

  describe('verifyBankAccount (internal)', () => {
    const body = { userId: 'u1', bankAccountId: 'b1' };

    it('returns ownership result for a valid secret', async () => {
      serviceMock.verifyBankAccountOwnership = vi
        .fn()
        .mockResolvedValue({ owned: true, active: true });
      await expect(controller.verifyBankAccount('secret-1', body)).resolves.toEqual({
        owned: true,
        active: true,
      });
      expect(serviceMock.verifyBankAccountOwnership).toHaveBeenCalledWith('u1', 'b1');
    });

    it('rejects missing or wrong secret', async () => {
      await expect(controller.verifyBankAccount(undefined, body)).rejects.toThrow();
      await expect(controller.verifyBankAccount('wrong-12', body)).rejects.toThrow();
    });

    it('rejects missing params', async () => {
      await expect(
        controller.verifyBankAccount('secret-1', { userId: 'u1' }),
      ).rejects.toThrow();
    });
  });

  it('should handle user.get-all-active-ids MessagePattern', async () => {
    serviceMock.getAllActiveUserIds = vi.fn().mockResolvedValue({
      userIds: ['user-1', 'user-2'],
    });

    const result = await controller.getAllActiveUserIds(
      { targetGroup: 'ALL' },
      undefined,
    );
    expect(result).toEqual({ userIds: ['user-1', 'user-2'] });
    expect(serviceMock.getAllActiveUserIds).toHaveBeenCalledWith('ALL');
  });

  it('should call service.getWorkerPublicProfile for getWorkerProfile and alias', async () => {
    const res1 = await controller.getWorkerProfile('worker-1');
    expect(res1).toEqual({ statusCode: 200, data: { id: 'w1' } });
    expect(serviceMock.getWorkerPublicProfile).toHaveBeenCalledWith('worker-1');

    const res2 = await controller.getWorkerProfileAlias('worker-1');
    expect(res2).toEqual({ statusCode: 200, data: { id: 'w1' } });
  });

  it('should call service.getWorkerReviews for getWorkerReviews', async () => {
    const query = { page: 1, limit: 10, rating: 5 };
    const res = await controller.getWorkerReviews('worker-1', query);
    expect(res).toEqual({ statusCode: 200, data: [], pagination: {} });
    expect(serviceMock.getWorkerReviews).toHaveBeenCalledWith('worker-1', query);
  });

  describe('Worker Service Registration Controller Tests', () => {
    const mockUser = {
      accountId: 'acc-1',
      userId: 'user-w1',
      sessionId: 'sess-1',
      roles: [RegisterRole.WORKER],
      permissions: ['profile:update', 'profile:read'],
    };

    it('submitMyServiceRegistration delegates to service with idempotency key', async () => {
      const dto: any = {
        categoryIds: ['0986472e-1728-4731-82b2-ff77a7251326'],
        services: [{ serviceId: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4' }],
        serviceArea: { address: 'Đà Nẵng', latitude: 16.0544, longitude: 108.2022, radiusKm: 15 },
        evidenceFiles: [{ url: 'https://example.com/proof.jpg', fileType: 'image' }],
      };

      const res = await controller.submitMyServiceRegistration(mockUser, dto, 'idem-key-1');
      expect(res).toEqual({ statusCode: 201, data: { id: 'reg-1' } });
      expect(serviceMock.submitWorkerServiceRegistration).toHaveBeenCalledWith('user-w1', dto, 'idem-key-1');
    });

    it('updateMyServiceRegistration delegates to service with idempotency key', async () => {
      const dto: any = {
        categoryIds: ['0986472e-1728-4731-82b2-ff77a7251326'],
        services: [{ serviceId: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4' }],
        serviceArea: { address: 'Đà Nẵng', latitude: 16.0544, longitude: 108.2022, radiusKm: 15 },
        evidenceFiles: [{ url: 'https://example.com/proof.jpg', fileType: 'image' }],
      };

      const res = await controller.updateMyServiceRegistration(mockUser, 'reg-1', dto, undefined, 'x-idem-key-2');
      expect(res).toEqual({ statusCode: 200, data: { id: 'reg-1' } });
      expect(serviceMock.updateWorkerServiceRegistration).toHaveBeenCalledWith('user-w1', 'reg-1', dto, 'x-idem-key-2');
    });

    it('getMyServiceRegistrations delegates to service', async () => {
      const res = await controller.getMyServiceRegistrations(mockUser);
      expect(res).toEqual({ statusCode: 200, data: [] });
      expect(serviceMock.getMyServiceRegistrations).toHaveBeenCalledWith('user-w1');
    });

    it('geocodeAddress delegates to service', async () => {
      const res = await controller.geocodeAddress('Đà Nẵng');
      expect(res).toEqual({ statusCode: 200, data: { latitude: 16.0544, longitude: 108.2022 } });
      expect(serviceMock.geocodeAddress).toHaveBeenCalledWith('Đà Nẵng');
    });

    it('listAdminServiceRegistrations delegates to service', async () => {
      const query = { page: 1, limit: 10, status: 'pending' as const };
      const res = await controller.listAdminServiceRegistrations(query);
      expect(res).toEqual({ statusCode: 200, data: [], pagination: {} });
      expect(serviceMock.listAdminServiceRegistrations).toHaveBeenCalledWith(query);
    });

    it('getAdminServiceRegistrationDetail delegates to service', async () => {
      const res = await controller.getAdminServiceRegistrationDetail('reg-1');
      expect(res).toEqual({ statusCode: 200, data: { id: 'reg-1' } });
      expect(serviceMock.getAdminServiceRegistrationDetail).toHaveBeenCalledWith('reg-1');
    });

    it('reviewServiceRegistration delegates to service', async () => {
      const adminUser = {
        accountId: 'acc-admin',
        userId: 'admin-1',
        sessionId: 'sess-admin',
        roles: ['admin'],
        permissions: ['user:manage'],
      };
      const dto = { decision: 'approved' as const };
      const res = await controller.reviewServiceRegistration(adminUser, 'reg-1', dto);
      expect(res).toEqual({ statusCode: 200, data: { status: 'approved' } });
      expect(serviceMock.reviewServiceRegistration).toHaveBeenCalledWith('admin-1', 'reg-1', dto);
    });

    it('updateServiceOffering delegates to service', async () => {
      const workerUser = {
        accountId: 'acc-w1',
        userId: 'user-w1',
        sessionId: 'sess-w1',
        roles: ['worker'],
        permissions: ['profile:update'],
      };
      const dto = { isActive: false };
      const res = await controller.updateServiceOffering(workerUser, '00000000-0000-0000-0000-000000000001', dto);
      expect(serviceMock.updateServiceOffering).toHaveBeenCalledWith(
        'user-w1',
        '00000000-0000-0000-0000-000000000001',
        false,
      );
    });

    it('toggleServiceOffering delegates to service without boolean', async () => {
      const workerUser = {
        accountId: 'acc-w1',
        userId: 'user-w1',
        sessionId: 'sess-w1',
        roles: ['worker'],
        permissions: ['profile:update'],
      };
      const res = await controller.toggleServiceOffering(workerUser, '00000000-0000-0000-0000-000000000001');
      expect(serviceMock.updateServiceOffering).toHaveBeenCalledWith(
        'user-w1',
        '00000000-0000-0000-0000-000000000001',
      );
    });
  });
});
