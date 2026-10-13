import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { OtpController } from './otp.controller.js';
import { OtpFlowService } from './otp-flow.service.js';

describe('OtpController', () => {
  let controller: OtpController;
  let otpFlowMock: any;
  let configMock: any;

  beforeEach(async () => {
    otpFlowMock = {
      verifyEmail: vi.fn().mockResolvedValue({ statusCode: 200 }),
      resendOtp: vi.fn().mockResolvedValue({ statusCode: 200 }),
      forgotPassword: vi.fn().mockResolvedValue({ statusCode: 200, message: 'OK', data: null }),
      verifyResetOtp: vi.fn().mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: { resetToken: 'mock-token', expiresIn: 900 },
      }),
      resetPassword: vi.fn().mockResolvedValue({ statusCode: 200, message: 'OK', data: null }),
    };

    configMock = {
      internalServiceSecret: 'test-gateway-secret',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        { provide: OtpFlowService, useValue: otpFlowMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<OtpController>(OtpController);
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

  it('should call forgotPassword on flow service', async () => {
    const dto = { email: 'a@example.com' };
    const fakeReq = { headers: {} } as any;
    await controller.forgotPassword(dto as any, '127.0.0.1', fakeReq);
    expect(otpFlowMock.forgotPassword).toHaveBeenCalledWith(dto, '127.0.0.1');
  });

  it('should call verifyResetOtp on flow service', async () => {
    const dto = { email: 'a@example.com', otp: '123456' };
    const fakeReq = { headers: {} } as any;
    await controller.verifyResetOtp(dto as any, '127.0.0.1', fakeReq);
    expect(otpFlowMock.verifyResetOtp).toHaveBeenCalledWith(dto, '127.0.0.1');
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
    expect(otpFlowMock.verifyResetOtp).toHaveBeenCalledWith(dto, '203.0.113.195');
  });

  it('should call resetPassword on flow service', async () => {
    const dto = { resetToken: 'mock-token', newPassword: 'NewP@ssword123' };
    await controller.resetPassword(dto as any);
    expect(otpFlowMock.resetPassword).toHaveBeenCalledWith(dto);
  });
});
