import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { TokenVerifierService } from '@app/auth';

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

    const result = await controller.handleUserRegistered(event);
    expect(result).toEqual({ processed: true });
    expect(serviceMock.handleUserRegistered).toHaveBeenCalledWith(event);
  });

  it('should return profile for authenticated user', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: ['Customer'],
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
});
