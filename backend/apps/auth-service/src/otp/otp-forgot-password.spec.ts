import { describe, expect, it, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { OtpFlowService } from './otp-flow.service.js';
import { OtpService } from './otp.service.js';
import { OtpController } from './otp.controller.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { PostgresThrottlerStorage } from '../common/rate-limit/postgres-throttler-storage.js';
import { UserTrustClient } from '../common/rpc/user-trust.client.js';
import { SessionService } from '../common/session/session.service.js';

describe('OTP Forgot Password Flow (HG-31 Phase 4)', () => {
  let module: TestingModule;
  let flowService: OtpFlowService;
  let otpService: OtpService;
  let rateLimiter: RateLimiterService;
  let controller: OtpController;
  let dbMock: any;
  let configMock: any;

  const validVerifiedAccount = {
    id: 'acc-1111-2222-3333-4444',
    userId: 'usr-1111-2222-3333-4444',
    email: 'valid.user@example.com',
    phone: '0912345678',
    status: 'active',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    dbMock = {
      account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      otpChallenge: {
        create: vi.fn().mockImplementation((args) =>
          Promise.resolve({ id: 'challenge-new-uuid', ...args.data }),
        ),
        update: vi.fn().mockImplementation((args) =>
          Promise.resolve({ id: args.where.id, ...args.data }),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ points: 1, expireAt: new Date(Date.now() + 3600000) }]),
    };

    configMock = {
      otpSecret: 'super-secret-otp-signing-key-for-testing',
      otpExpirationMinutes: 10,
      otpResendCooldownSeconds: 60,
      otpMaxAttempts: 5,
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'test@example.com',
      smtpPass: 'testpass',
      smtpFrom: 'no-reply@handygo.vn',
      internalServiceSecret: 'gateway-shared-secret',
    };

    module = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        OtpFlowService,
        OtpService,
        RateLimiterService,
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: ConfigService, useValue: configMock },
        { provide: UserTrustClient, useValue: { confirmUserStatus: vi.fn() } },
        { provide: SessionService, useValue: {} },
      ],
    }).compile();

    flowService = module.get<OtpFlowService>(OtpFlowService);
    otpService = module.get<OtpService>(OtpService);
    rateLimiter = module.get<RateLimiterService>(RateLimiterService);
    controller = module.get<OtpController>(OtpController);
  });

  describe('1. Email hợp lệ của tài khoản đã xác minh', () => {
    it('tạo OTP reset_password, lưu HMAC hash và gửi đúng địa chỉ', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validVerifiedAccount);
      const sendMailSpy = vi.spyOn(otpService, 'sendPasswordResetOtp').mockResolvedValueOnce();

      const response = await flowService.forgotPassword(
        { email: 'valid.user@example.com' },
        '203.0.113.10',
      );

      // Trả status 200 và message công khai
      expect(response).toEqual({
        statusCode: HttpStatus.OK,
        message: 'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
        data: null,
      });

      // Kiểm tra tạo challenge với type reset_password
      expect(dbMock.otpChallenge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: validVerifiedAccount.id,
          type: 'reset_password',
          otpHash: expect.any(String),
          isUsed: false,
          deliveryStatus: 'pending',
          expiresAt: expect.any(Date),
        }),
      });

      // Kiểm tra OTP được gửi tới đúng email
      expect(sendMailSpy).toHaveBeenCalledWith(
        'valid.user@example.com',
        expect.stringMatching(/^\d{6}$/),
      );

      // Đánh dấu challenge delivered sau khi gửi mail thành công
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-new-uuid' },
        data: { deliveryStatus: 'delivered' },
      });
    });

    it('chuẩn hóa email trước khi tra cứu và băm HMAC (lowercase và trim)', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validVerifiedAccount);
      const sendMailSpy = vi.spyOn(otpService, 'sendPasswordResetOtp').mockResolvedValueOnce();

      await flowService.forgotPassword(
        { email: '  Valid.User@Example.COM  ' },
        '203.0.113.10',
      );

      // Tra cứu với email đã chuẩn hóa
      expect(dbMock.account.findUnique).toHaveBeenCalledWith({
        where: { email: 'valid.user@example.com' },
      });

      // Gửi mail tới email đã chuẩn hóa
      expect(sendMailSpy).toHaveBeenCalledWith(
        'valid.user@example.com',
        expect.any(String),
      );
    });
  });

  describe('2. Chống lộ tài khoản (User Enumeration Prevention)', () => {
    it('email không tồn tại không tạo challenge nhưng trả cùng status và body', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(null);
      const sendMailSpy = vi.spyOn(otpService, 'sendPasswordResetOtp');

      const response = await flowService.forgotPassword(
        { email: 'unknown@example.com' },
        '203.0.113.10',
      );

      expect(response).toEqual({
        statusCode: HttpStatus.OK,
        message: 'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
        data: null,
      });

      expect(dbMock.otpChallenge.create).not.toHaveBeenCalled();
      expect(sendMailSpy).not.toHaveBeenCalled();
    });

    it('tài khoản chưa xác minh email (emailVerifiedAt = null) không tạo challenge và trả cùng response', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce({
        ...validVerifiedAccount,
        status: 'pending',
        emailVerifiedAt: null,
      });
      const sendMailSpy = vi.spyOn(otpService, 'sendPasswordResetOtp');

      const response = await flowService.forgotPassword(
        { email: 'unverified@example.com' },
        '203.0.113.10',
      );

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toBeNull();
      expect(dbMock.otpChallenge.create).not.toHaveBeenCalled();
      expect(sendMailSpy).not.toHaveBeenCalled();
    });

    it('tài khoản bị khóa (status = locked hoặc suspended) không tạo challenge và trả cùng response', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce({
        ...validVerifiedAccount,
        status: 'locked',
      });
      const sendMailSpy = vi.spyOn(otpService, 'sendPasswordResetOtp');

      const response = await flowService.forgotPassword(
        { email: 'locked@example.com' },
        '203.0.113.10',
      );

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toBeNull();
      expect(dbMock.otpChallenge.create).not.toHaveBeenCalled();
      expect(sendMailSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Xử lý lỗi SMTP không làm lộ tài khoản', () => {
    it('SMTP lỗi không làm lộ tài khoản qua status/body; challenge không được coi là đã gửi thành công', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validVerifiedAccount);
      vi.spyOn(otpService, 'sendPasswordResetOtp').mockRejectedValueOnce(
        new Error('SMTP service network unreachable / 554 Transaction failed'),
      );

      // Không ném lỗi ra ngoài
      const response = await flowService.forgotPassword(
        { email: 'valid.user@example.com' },
        '203.0.113.10',
      );

      // Vẫn trả về cùng status và body công khai
      expect(response).toEqual({
        statusCode: HttpStatus.OK,
        message: 'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
        data: null,
      });

      // Challenge được cập nhật deliveryStatus = failed và deliveryError
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-new-uuid' },
        data: {
          deliveryStatus: 'failed',
          deliveryError: expect.stringContaining('SMTP service network unreachable'),
        },
      });

      // Tuyệt đối không được đánh dấu là delivered
      expect(dbMock.otpChallenge.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryStatus: 'delivered' }),
        }),
      );
    });
  });

  describe('4. Vô hiệu hóa Challenge cũ sau yêu cầu mới', () => {
    it('challenge cũ không còn dùng được sau yêu cầu mới (isUsed: true)', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validVerifiedAccount);
      vi.spyOn(otpService, 'sendPasswordResetOtp').mockResolvedValueOnce();

      await flowService.forgotPassword(
        { email: 'valid.user@example.com' },
        '203.0.113.10',
      );

      // Phải vô hiệu hóa các challenge reset_password cũ còn isUsed = false của account này
      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith({
        where: {
          accountId: validVerifiedAccount.id,
          type: 'reset_password',
          isUsed: false,
        },
        data: {
          isUsed: true,
        },
      });
    });
  });

  describe('5. Rate Limiting theo Email HMAC và IP (chia sẻ giữa các instance)', () => {
    it('vượt quá 5 yêu cầu/giờ theo email (đã HMAC) trả 429', async () => {
      const emailHmac = otpService.hashEmail('valid.user@example.com');

      // Giả lập storage trả về points = 6 > limit 5 cho key email
      const checkSpy = vi.spyOn(rateLimiter, 'checkAndIncrement');
      checkSpy.mockImplementation(async (key, _limit) => {
        if (key.includes(emailHmac)) {
          throw new AppException(429, ERROR_CODES.RATE_LIMITED, 'Email này đã gửi quá nhiều yêu cầu đặt lại mật khẩu trong 1 giờ. Vui lòng thử lại sau.');
        }
      });

      await expect(
        flowService.forgotPassword({ email: 'valid.user@example.com' }, '203.0.113.10'),
      ).rejects.toThrow(AppException);

      try {
        await flowService.forgotPassword({ email: 'valid.user@example.com' }, '203.0.113.10');
      } catch (err: any) {
        expect(err.getStatus()).toBe(429);
        expect(err.getResponse().code).toBe(ERROR_CODES.RATE_LIMITED);
      }
    });

    it('vượt quá 10 yêu cầu/giờ theo IP trả 429', async () => {
      const checkSpy = vi.spyOn(rateLimiter, 'checkAndIncrement');
      checkSpy.mockImplementation(async (key) => {
        if (key.includes('203.0.113.99')) {
          throw new AppException(429, ERROR_CODES.RATE_LIMITED, 'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 1 giờ.');
        }
      });

      await expect(
        flowService.forgotPassword({ email: 'other@example.com' }, '203.0.113.99'),
      ).rejects.toThrow(AppException);

      try {
        await flowService.forgotPassword({ email: 'other@example.com' }, '203.0.113.99');
      } catch (err: any) {
        expect(err.getStatus()).toBe(429);
        expect(err.getResponse().code).toBe(ERROR_CODES.RATE_LIMITED);
      }
    });

    it('hai instance dùng chung cùng một bộ đếm qua bảng rate_limits PostgreSQL', async () => {
      let sharedEmailPoints = 0;
      const expireAt = new Date(Date.now() + 3600000);

      // DB mock lưu trữ trạng thái chia sẻ giữa 2 instance
      const sharedDb: any = {
        $queryRaw: vi.fn().mockImplementation((_query) => {
          sharedEmailPoints++;
          return Promise.resolve([{ points: sharedEmailPoints, expireAt }]);
        }),
      };

      const storageA = new PostgresThrottlerStorage(sharedDb);
      const storageB = new PostgresThrottlerStorage(sharedDb);

      const limiterA = new RateLimiterService(storageA);
      const limiterB = new RateLimiterService(storageB);

      const emailKey = 'forgot_password_email:test-hmac-shared';
      const limit = 5;

      // Instance A thực hiện 3 requests
      await limiterA.checkAndIncrement(emailKey, limit, 3600);
      await limiterA.checkAndIncrement(emailKey, limit, 3600);
      await limiterA.checkAndIncrement(emailKey, limit, 3600);
      expect(sharedEmailPoints).toBe(3);

      // Instance B thực hiện 2 requests (tổng = 5, vừa chạm limit)
      await limiterB.checkAndIncrement(emailKey, limit, 3600);
      await limiterB.checkAndIncrement(emailKey, limit, 3600);
      expect(sharedEmailPoints).toBe(5);

      // Instance B gửi request thứ 6 -> vượt ngưỡng -> nhận 429
      await expect(
        limiterB.checkAndIncrement(emailKey, limit, 3600),
      ).rejects.toThrow(AppException);

      // Instance A gửi tiếp -> cũng nhận 429 do dùng chung bộ đếm
      await expect(
        limiterA.checkAndIncrement(emailKey, limit, 3600),
      ).rejects.toThrow(AppException);
    });
  });

  describe('6. Controller Endpoint POST /auth/forgot-password', () => {
    it('gọi controller chuyển tiếp đúng dto và ip tới flow service', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validVerifiedAccount);
      vi.spyOn(otpService, 'sendPasswordResetOtp').mockResolvedValueOnce();

      const fakeReq = { headers: {} } as any;
      const res = await controller.forgotPassword(
        { email: 'valid.user@example.com' },
        '10.0.0.5',
        fakeReq,
      );

      expect(res.statusCode).toBe(200);
      expect(res.data).toBeNull();
    });
  });
});
