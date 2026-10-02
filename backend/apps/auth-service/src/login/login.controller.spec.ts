import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { LoginController } from './login.controller.js';
import { LoginFlowService } from './login-flow.service.js';

describe('LoginController', () => {
  let controller: LoginController;
  let loginFlowMock: any;
  let configMock: any;

  beforeEach(async () => {
    loginFlowMock = {
      login: vi.fn().mockResolvedValue({ statusCode: 200 }),
      refresh: vi.fn().mockResolvedValue({ statusCode: 200 }),
      logout: vi.fn().mockResolvedValue({ statusCode: 200, message: 'Đăng xuất thành công', data: null }),
      getMe: vi.fn().mockResolvedValue({ statusCode: 200 }),
    };

    configMock = {
      internalServiceSecret: 'test-gateway-secret',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoginController],
      providers: [
        { provide: LoginFlowService, useValue: loginFlowMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<LoginController>(LoginController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call login on flow service', async () => {
    const dto = { phone: '0912345678', password: 'Password123' };
    const fakeReq = { headers: { 'user-agent': 'Jest' } } as any;
    await controller.login(dto as any, '127.0.0.1', fakeReq);
    expect(loginFlowMock.login).toHaveBeenCalledWith(dto, '127.0.0.1', 'Jest');
  });

  it('should call refresh on flow service', async () => {
    const dto = { refreshToken: 'mock-refresh' };
    const fakeReq = { headers: {} } as any;
    await controller.refresh(dto as any, '127.0.0.1', fakeReq);
    expect(loginFlowMock.refresh).toHaveBeenCalledWith(dto, '127.0.0.1', undefined);
  });

  it('should call logout on flow service', async () => {
    const dto = { refreshToken: 'mock-refresh' };
    await controller.logout(dto as any);
    expect(loginFlowMock.logout).toHaveBeenCalledWith(dto);
  });

  it('should call getMe on flow service', async () => {
    const user = { accountId: 'acc-123' };
    await controller.getMe(user as any);
    expect(loginFlowMock.getMe).toHaveBeenCalledWith('acc-123');
  });
});
