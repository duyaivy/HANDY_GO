import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { PasswordResetFlowService } from './password-reset-flow.service.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { SessionService } from '../common/session/session.service.js';

describe('OTP Forgot Password Flow (HG-31 Phase 4)', () => {
  let module: TestingModule;
  let flowService: PasswordResetFlowService;
  let otpService: OtpService;
  let rateLimiter: RateLimiterService;
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

  beforeAll(async () => {
    dbMock = {
      account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      otpChallenge: {
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
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
      providers: [
        PasswordResetFlowService,
        OtpService,
        RateLimiterService,
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: ConfigService, useValue: configMock },
        { provide: SessionService, useValue: {} },
      ],
    }).compile();

    flowService = module.get<PasswordResetFlowService>(PasswordResetFlowService);
    otpService = module.get<OtpService>(OtpService);
    rateLimiter = module.get<RateLimiterService>(RateLimiterService);
  });

  afterAll(async () => {
    await module?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.otpChallenge.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'challenge-new-uuid', ...args.data }),
    );
    dbMock.otpChallenge.update.mockImplementation((args: any) =>
      Promise.resolve({ id: args.where.id, ...args.data }),
    );
    dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    dbMock.$queryRaw.mockResolvedValue([
      { points: 1, expireAt: new Date(Date.now() + 3600000) },
    ]);
  });

  describe('1. Email hợp lệ của tài khoản đã xác minh', () => {
    it('tạo OTP reset_password, lưu HMAC hash và gửi đúng địa chỉ', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validVerifiedAccount);
      const sendMailSpy = vi
        .spyOn(otpService, 'sendPasswordResetOtp')
        .mockResolvedValueOnce();

      const response = await flowService.forgotPassword(
        { email: 'valid.user@example.com' },
        '203.0.113.10',
      );

      // Trả status 200 và message công khai
      expect(response).toEqual({
        statusCode: HttpStatus.OK,
        message:
          'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
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
      const sendMailSpy = vi
        .spyOn(otpService, 'sendPasswordResetOtp')
        .mockResolvedValueOnce();

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
    it.each([
      ['email không tồn tại', null],
      [
        'email chưa xác minh (emailVerifiedAt = null)',
        {
          ...validVerifiedAccount,
          status: 'pending',
          emailVerifiedAt: null,
        },
      ],
      [
        'tài khoản bị khóa (status = locked hoặc suspended)',
        { ...validVerifiedAccount, status: 'locked' },
      ],
    ])(
      '%s không tạo challenge và trả phản hồi trung lập',
      async (_, account) => {
        dbMock.account.findUnique.mockResolvedValueOnce(account);
        const sendMailSpy = vi.spyOn(otpService, 'sendPasswordResetOtp');

        const response = await flowService.forgotPassword(
          { email: 'target@example.com' },
          '203.0.113.10',
        );

        expect(response).toEqual({
          statusCode: HttpStatus.OK,
          message:
            'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
          data: null,
        });

        expect(dbMock.otpChallenge.create).not.toHaveBeenCalled();
        expect(sendMailSpy).not.toHaveBeenCalled();
      },
    );
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
        message:
          'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
        data: null,
      });

      // Challenge được cập nhật deliveryStatus = failed và deliveryError
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-new-uuid' },
        data: {
          deliveryStatus: 'failed',
          deliveryError: expect.stringContaining(
            'SMTP service network unreachable',
          ),
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

  describe('5. Rate Limiting theo Email HMAC và IP', () => {
    it.each([
      [
        'vượt quá 5 yêu cầu/giờ theo email (đã HMAC)',
        'valid.user@example.com',
        '203.0.113.10',
        'Email này đã gửi quá nhiều yêu cầu đặt lại mật khẩu trong 1 giờ. Vui lòng thử lại sau.',
      ],
      [
        'vượt quá 10 yêu cầu/giờ theo IP',
        'other@example.com',
        '203.0.113.99',
        'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 1 giờ.',
      ],
    ])('%s trả 429 RATE_LIMITED', async (_, email, ip, message) => {
      vi.spyOn(rateLimiter, 'checkAndIncrement').mockRejectedValueOnce(
        new AppException(HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMITED, message),
      );

      await expect(
        flowService.forgotPassword({ email }, ip),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            code: ERROR_CODES.RATE_LIMITED,
          }),
        }),
      );
    });
  });
});
