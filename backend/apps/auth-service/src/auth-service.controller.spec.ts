import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { AuthServiceController } from './auth-service.controller.js';
import { AuthServiceService } from './auth-service.service.js';
import { TokenVerifierService } from '@app/auth';

describe('AuthServiceController', () => {
  let controller: AuthServiceController;
  let authServiceMock: any;
  let configMock: any;

  beforeEach(async () => {
    authServiceMock = {
      register: vi.fn().mockResolvedValue({ statusCode: 201 }),
      verifyEmail: vi.fn().mockResolvedValue({ statusCode: 200 }),
      resendOtp: vi.fn().mockResolvedValue({ statusCode: 200 }),
      login: vi.fn().mockResolvedValue({ statusCode: 200 }),
      refresh: vi.fn().mockResolvedValue({ statusCode: 200 }),
      logout: vi.fn().mockResolvedValue({ statusCode: 200, message: 'Đăng xuất thành công', data: null }),
      getMe: vi.fn().mockResolvedValue({ statusCode: 200 }),
    };

    configMock = {
      internalServiceSecret: 'test-gateway-secret',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthServiceController],
      providers: [
        { provide: AuthServiceService, useValue: authServiceMock },
        { provide: TokenVerifierService, useValue: { verifyAccessToken: vi.fn() } },
        { provide: ConfigService, useValue: configMock },
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

  it('should ignore client-supplied x-forwarded-for if internal secret is missing or invalid', async () => {
    const dto = {
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      email: 'a@example.com',
      password: 'Password123',
    };
    const fakeReq = {
      headers: {
        'x-forwarded-for': '203.0.113.195',
      },
      socket: { remoteAddress: '127.0.0.1' },
      ip: '127.0.0.1',
    } as any;

    await controller.register(dto as any, '127.0.0.1', fakeReq);
    expect(authServiceMock.register).toHaveBeenCalledWith(dto, '127.0.0.1');
  });

  it('should accept forwarded IP when verified by valid internal secret', async () => {
    const dto = {
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      email: 'a@example.com',
      password: 'Password123',
    };
    const trustedReq = {
      headers: {
        'x-forwarded-for': '203.0.113.195',
        'x-internal-secret': 'test-gateway-secret',
      },
      socket: { remoteAddress: '10.0.0.2' },
    } as any;

    await controller.register(dto as any, '10.0.0.2', trustedReq);
    expect(authServiceMock.register).toHaveBeenCalledWith(dto, '203.0.113.195');
  });
});
