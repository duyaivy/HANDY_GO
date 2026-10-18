import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { RegisterRole, TokenVerifierService } from '@app/auth';

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

  it('should get KYC status for current user', async () => {
    serviceMock.getMyKycStatus = vi.fn().mockResolvedValue({ statusCode: 200, data: { workerStatus: 'draft' } });
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.WORKER],
      permissions: ['profile:read'],
    };

    const res = await controller.getMyKycStatus(user);
    expect(res).toEqual({ statusCode: 200, data: { workerStatus: 'draft' } });
    expect(serviceMock.getMyKycStatus).toHaveBeenCalledWith('user-1');
  });

  it('should handle submitMyKyc', async () => {
    serviceMock.submitKyc = vi.fn().mockResolvedValue({ statusCode: 201 });
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.WORKER],
      permissions: ['profile:update'],
    };

    const dto = { idDocumentType: 'CCCD' };
    const res = await controller.submitMyKyc(user, dto);
    expect(res).toEqual({ statusCode: 201 });
    expect(serviceMock.submitKyc).toHaveBeenCalledWith('user-1', dto);
  });

  it('should handle kyc.pending domain event', async () => {
    serviceMock.handleKycPending = vi.fn().mockResolvedValue({ processed: true });
    const event = { eventId: 'evt-1', data: { userId: 'user-1' } } as any;
    const res = await controller.handleKycPending(event, undefined);
    expect(res).toEqual({ processed: true });
    expect(serviceMock.handleKycPending).toHaveBeenCalledWith(event);
  });

  it('should handle kyc.reviewing domain event', async () => {
    serviceMock.handleKycReviewing = vi.fn().mockResolvedValue({ processed: true });
    const event = { eventId: 'evt-2', data: { userId: 'user-1' } } as any;
    const res = await controller.handleKycReviewing(event, undefined);
    expect(res).toEqual({ processed: true });
    expect(serviceMock.handleKycReviewing).toHaveBeenCalledWith(event);
  });

  it('should handle kyc.completed domain event', async () => {
    serviceMock.handleKycCompleted = vi.fn().mockResolvedValue({ processed: true });
    const event = { eventId: 'evt-3', data: { userId: 'user-1' } } as any;
    const res = await controller.handleKycCompleted(event, undefined);
    expect(res).toEqual({ processed: true });
    expect(serviceMock.handleKycCompleted).toHaveBeenCalledWith(event);
  });
});
