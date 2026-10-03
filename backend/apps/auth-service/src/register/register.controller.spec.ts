import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { RegisterController } from './register.controller.js';
import { RegisterFlowService } from './register-flow.service.js';

describe('RegisterController', () => {
  let controller: RegisterController;
  let registerFlowMock: any;
  let configMock: any;

  beforeEach(async () => {
    registerFlowMock = {
      execute: vi.fn().mockResolvedValue({ statusCode: 201 }),
    };

    configMock = {
      internalServiceSecret: 'test-gateway-secret',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegisterController],
      providers: [
        { provide: RegisterFlowService, useValue: registerFlowMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<RegisterController>(RegisterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call register on flow service', async () => {
    const dto = {
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      email: 'a@example.com',
      password: 'Password123',
    };
    await controller.register(dto as any, '127.0.0.1', { headers: {} } as any);
    expect(registerFlowMock.execute).toHaveBeenCalledWith(dto, '127.0.0.1');
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
    expect(registerFlowMock.execute).toHaveBeenCalledWith(dto, '127.0.0.1');
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
    expect(registerFlowMock.execute).toHaveBeenCalledWith(dto, '203.0.113.195');
  });
});
