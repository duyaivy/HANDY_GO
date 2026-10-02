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
});
