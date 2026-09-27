import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthServiceController } from './auth-service.controller.js';
import { AuthServiceService } from './auth-service.service.js';
import { TokenVerifierService } from '@app/auth';

describe('AuthServiceController', () => {
  let controller: AuthServiceController;
  let authServiceMock: any;

  beforeEach(async () => {
    authServiceMock = {
      register: vi.fn().mockResolvedValue({ statusCode: 201 }),
      verifyEmail: vi.fn().mockResolvedValue({ statusCode: 200 }),
      resendOtp: vi.fn().mockResolvedValue({ statusCode: 200 }),
      login: vi.fn().mockResolvedValue({ statusCode: 200 }),
      refresh: vi.fn().mockResolvedValue({ statusCode: 200 }),
      logout: vi.fn().mockResolvedValue({ statusCode: 200 }),
      getMe: vi.fn().mockResolvedValue({ statusCode: 200 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthServiceController],
      providers: [
        { provide: AuthServiceService, useValue: authServiceMock },
        { provide: TokenVerifierService, useValue: { verifyAccessToken: vi.fn() } },
      ],
    }).compile();

    controller = module.get<AuthServiceController>(AuthServiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call register on service', async () => {
    const dto = {
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      email: 'a@example.com',
      password: 'Password123',
    };
    await controller.register(dto as any, '127.0.0.1', { headers: {} } as any);
    expect(authServiceMock.register).toHaveBeenCalledWith(dto, '127.0.0.1');
  });
});
