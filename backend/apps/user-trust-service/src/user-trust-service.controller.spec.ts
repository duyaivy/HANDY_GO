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
});
