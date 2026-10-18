import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { OtpController } from './otp.controller.js';
import { OtpFlowService } from './otp-flow.service.js';
import { PasswordResetFlowService } from './password-reset-flow.service.js';

describe('OtpController', () => {
  let module: TestingModule;
  let controller: OtpController;
  let otpFlowMock: {
    verifyEmail: ReturnType<typeof vi.fn>;
    resendOtp: ReturnType<typeof vi.fn>;
  };
  let passwordResetFlowMock: {
    forgotPassword: ReturnType<typeof vi.fn>;
    verifyResetOtp: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
  };
  let configMock: {
    internalServiceSecret: string;
  };

  beforeAll(async () => {
    otpFlowMock = {
      verifyEmail: vi.fn(),
      resendOtp: vi.fn(),
    };

    passwordResetFlowMock = {
      forgotPassword: vi.fn(),
      verifyResetOtp: vi.fn(),
      resetPassword: vi.fn(),
    };

    configMock = {
      internalServiceSecret: 'test-gateway-secret',
    };

    module = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        { provide: OtpFlowService, useValue: otpFlowMock },
        { provide: PasswordResetFlowService, useValue: passwordResetFlowMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<OtpController>(OtpController);
  });

  afterAll(async () => {
    await module?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    otpFlowMock.verifyEmail.mockResolvedValue({ statusCode: 200 });
    otpFlowMock.resendOtp.mockResolvedValue({ statusCode: 200 });
    passwordResetFlowMock.forgotPassword.mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: null,
    });
    passwordResetFlowMock.verifyResetOtp.mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { resetToken: 'mock-token', expiresIn: 900 },
    });
    passwordResetFlowMock.resetPassword.mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: null,
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call verifyEmail on flow service', async () => {
    const dto = { email: 'a@example.com', otp: '123456' };
    const fakeReq = { headers: { 'user-agent': 'Jest' } } as any;
    await controller.verifyEmail(dto as any, '127.0.0.1', fakeReq);
    expect(otpFlowMock.verifyEmail).toHaveBeenCalledWith(dto, '127.0.0.1', 'Jest');
  });

  it('should call resendOtp on flow service', async () => {
    const dto = { email: 'a@example.com' };
    const fakeReq = { headers: {} } as any;
    await controller.resendOtp(dto as any, '127.0.0.1', fakeReq);
    expect(otpFlowMock.resendOtp).toHaveBeenCalledWith(dto, '127.0.0.1');
  });

  it('should call forgotPassword on password reset flow service', async () => {
    const dto = { email: 'a@example.com' };
    const fakeReq = { headers: {} } as any;
    await controller.forgotPassword(dto as any, '127.0.0.1', fakeReq);
    expect(passwordResetFlowMock.forgotPassword).toHaveBeenCalledWith(dto, '127.0.0.1');
  });

  it('should call verifyResetOtp on password reset flow service', async () => {
    const dto = { email: 'a@example.com', otp: '123456' };
    const fakeReq = { headers: {} } as any;
    await controller.verifyResetOtp(dto as any, '127.0.0.1', fakeReq);
    expect(passwordResetFlowMock.verifyResetOtp).toHaveBeenCalledWith(dto, '127.0.0.1');
  });

  it('should resolve client IP from trusted gateway and pass to verifyResetOtp', async () => {
    const dto = { email: 'a@example.com', otp: '123456' };
    const fakeReq = {
      headers: {
        'x-internal-secret': 'test-gateway-secret',
        'x-forwarded-for': '203.0.113.195, 10.0.0.1',
      },
    } as any;
    await controller.verifyResetOtp(dto as any, '10.0.0.1', fakeReq);
    expect(passwordResetFlowMock.verifyResetOtp).toHaveBeenCalledWith(dto, '203.0.113.195');
  });

  it('should call resetPassword on password reset flow service', async () => {
    const dto = { resetToken: 'mock-token', newPassword: 'NewP@ssword123' };
    await controller.resetPassword(dto as any);
    expect(passwordResetFlowMock.resetPassword).toHaveBeenCalledWith(dto);
  });
});
