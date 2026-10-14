import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import crypto from 'node:crypto';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { PasswordResetFlowService } from './password-reset-flow.service.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { SessionService } from '../common/session/session.service.js';

describe('OTP Verification & Single-Use Password Reset Flow (HG-31 Phase 5)', () => {
  let module: TestingModule;
  let flowService: PasswordResetFlowService;
  let otpService: OtpService;
  let sessionService: SessionService;
  let dbMock: any;
  let configMock: any;
  let sessionServiceMock: any;

  const validAccount = {
    id: 'acc-uuid-1111-2222',
    userId: 'usr-uuid-1111-2222',
    email: 'reset.user@example.com',
    phone: '0912345678',
    passwordHash:
      '$2b$10$oldHashValueOldPasswordOldPasswordOldPasswordOldPassw',
    status: 'active',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    passwordChangedAt: null,
  };

  const rawOtpCode = '654321';
  const hashedOtpCode = 'hmac_sha256_mock_hash_for_654321';

  beforeAll(async () => {
    dbMock = {
      account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      passwordResetGrant: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      refreshSession: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(dbMock)),
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

    sessionServiceMock = {
      revokeAllSessions: vi.fn().mockImplementation(async (accountId, tx) => {
        const client = tx ?? dbMock;
        await client.refreshSession.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        PasswordResetFlowService,
        OtpService,
        {
          provide: RateLimiterService,
          useValue: { checkAndIncrement: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: ConfigService, useValue: configMock },
        { provide: SessionService, useValue: sessionServiceMock },
      ],
    }).compile();

    flowService = module.get<PasswordResetFlowService>(PasswordResetFlowService);
    otpService = module.get<OtpService>(OtpService);
    sessionService = module.get<SessionService>(SessionService);
  });

  afterAll(async () => {
    await module?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.account.findUnique.mockReset();
    dbMock.account.findFirst.mockReset();
    dbMock.account.update.mockImplementation((args: any) =>
      Promise.resolve({ ...validAccount, ...args.data }),
    );
    dbMock.otpChallenge.findFirst.mockReset();
    dbMock.otpChallenge.findUnique.mockReset();
    dbMock.otpChallenge.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'challenge-new-uuid', ...args.data }),
    );
    dbMock.otpChallenge.update.mockImplementation((args: any) =>
      Promise.resolve({ id: args.where.id, ...args.data }),
    );
    dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    dbMock.passwordResetGrant.findUnique.mockReset();
    dbMock.passwordResetGrant.findFirst.mockReset();
    dbMock.passwordResetGrant.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'grant-new-uuid', ...args.data }),
    );
    dbMock.passwordResetGrant.update.mockImplementation((args: any) =>
      Promise.resolve({ id: args.where.id, ...args.data }),
    );
    dbMock.passwordResetGrant.updateMany.mockResolvedValue({ count: 1 });
    dbMock.refreshSession.updateMany.mockResolvedValue({ count: 2 });
    dbMock.$transaction.mockImplementation(async (cb: any) => cb(dbMock));
  });

  it('khởi tạo thành công flowService và dependencies', () => {
    expect(flowService).toBeDefined();
    expect(otpService).toBeDefined();
    expect(sessionService).toBeDefined();
  });

  describe('1. Kiểm tra xác thực OTP (POST /auth/verify-reset-otp)', () => {
    const expectGenericOtpError = async (promise: Promise<any>) => {
      try {
        await promise;
        expect.unreachable('Should have thrown generic OTP error');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const res = err.getResponse();
        expect(res.code).toBe(ERROR_CODES.OTP_INVALID);
        expect(res.message).toBe('Mã OTP không hợp lệ hoặc đã hết hạn');
        expect(res.data?.remainingAttempts).toBeUndefined();
      }
    };

    it.each([
      [
        'tài khoản không tồn tại',
        () => dbMock.account.findUnique.mockResolvedValueOnce(null),
      ],
      [
        'tài khoản bị khóa (locked, suspended, deleted)',
        () =>
          dbMock.account.findUnique.mockResolvedValueOnce({
            ...validAccount,
            status: 'locked',
          }),
      ],
      [
        'OTP chưa được gửi thành công (deliveryStatus !== delivered)',
        () => {
          dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
          dbMock.otpChallenge.findFirst.mockResolvedValueOnce({
            id: 'ch-pending',
            accountId: validAccount.id,
            type: 'reset_password',
            otpHash: hashedOtpCode,
            expiresAt: new Date(Date.now() + 600000),
            attempts: 0,
            isUsed: false,
            deliveryStatus: 'failed',
          });
        },
      ],
      [
        'OTP đã được sử dụng',
        () => {
          dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
          dbMock.otpChallenge.findFirst.mockResolvedValueOnce({
            id: 'ch-used',
            accountId: validAccount.id,
            type: 'reset_password',
            otpHash: hashedOtpCode,
            expiresAt: new Date(Date.now() + 600000),
            attempts: 0,
            isUsed: true,
            deliveryStatus: 'delivered',
          });
        },
      ],
      [
        'OTP đã hết hạn',
        () => {
          dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
          dbMock.otpChallenge.findFirst.mockResolvedValueOnce({
            id: 'ch-expired',
            accountId: validAccount.id,
            type: 'reset_password',
            otpHash: hashedOtpCode,
            expiresAt: new Date(Date.now() - 5000),
            attempts: 0,
            isUsed: false,
            deliveryStatus: 'delivered',
          });
        },
      ],
      [
        'OTP đã chạm mốc 5 lần thử (attempts = 5)',
        () => {
          dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
          dbMock.otpChallenge.findFirst.mockResolvedValueOnce({
            id: 'ch-maxed',
            accountId: validAccount.id,
            type: 'reset_password',
            otpHash: hashedOtpCode,
            expiresAt: new Date(Date.now() + 600000),
            attempts: 5,
            isUsed: false,
            deliveryStatus: 'delivered',
          });
        },
      ],
      [
        'challenge đã bị khóa sau 5 lần sai, nhập mã đúng vẫn từ chối',
        () => {
          dbMock.account.findUnique.mockResolvedValue(validAccount);
          dbMock.otpChallenge.findFirst.mockResolvedValue({
            id: 'ch-locked-after-5',
            accountId: validAccount.id,
            type: 'reset_password',
            otpHash: hashedOtpCode,
            expiresAt: new Date(Date.now() + 600000),
            attempts: 5,
            isUsed: false,
            deliveryStatus: 'delivered',
          });
          vi.spyOn(otpService, 'verifyOtpHash').mockReturnValue(true);
        },
      ],
    ])(
      'từ chối với phản hồi lỗi chung khi %s, không tiết lộ remainingAttempts',
      async (_, setupMock) => {
        setupMock();
        await expectGenericOtpError(
          flowService.verifyResetOtp({
            email: validAccount.email,
            otp: rawOtpCode,
          }),
        );
        expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
      },
    );

    it('từ chối với phản hồi lỗi chung và tăng số lần thử nguyên tử trong DB khi OTP sai mã', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
      const activeChallenge = {
        id: 'ch-wrong-code',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        expiresAt: new Date(Date.now() + 600000),
        attempts: 1,
        isUsed: false,
        deliveryStatus: 'delivered',
      };
      dbMock.otpChallenge.findFirst.mockResolvedValueOnce(activeChallenge);
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValueOnce(false);

      await expectGenericOtpError(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: '999999',
        }),
      );

      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: activeChallenge.id,
            isUsed: false,
            deliveryStatus: 'delivered',
            attempts: { lt: 5 },
          }),
          data: {
            attempts: { increment: 1 },
          },
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('chặn request thứ 11 trong 1 giờ từ cùng một IP với HTTP 429 RATE_LIMITED trước khi tra cứu tài khoản', async () => {
      const rateLimiter = module.get<RateLimiterService>(RateLimiterService);
      vi.spyOn(rateLimiter, 'checkAndIncrement').mockRejectedValueOnce(
        new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          ERROR_CODES.RATE_LIMITED,
          'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu xác thực OTP đặt lại mật khẩu. Vui lòng thử lại sau 1 giờ.',
        ),
      );

      await expect(
        flowService.verifyResetOtp(
          { email: validAccount.email, otp: rawOtpCode },
          '203.0.113.195',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            statusCode: 429,
            code: ERROR_CODES.RATE_LIMITED,
          }),
        }),
      );

      expect(rateLimiter.checkAndIncrement).toHaveBeenCalledWith(
        'verify_reset_otp_ip:203.0.113.195',
        10,
        3600,
        expect.any(String),
      );
      // Giới hạn áp dụng trước khi tra cứu tài khoản
      expect(dbMock.account.findUnique).not.toHaveBeenCalled();
    });

    it('IP khác có quota độc lập, key limiter được gán đúng theo IP client', async () => {
      const rateLimiter = module.get<RateLimiterService>(RateLimiterService);
      const checkSpy = vi
        .spyOn(rateLimiter, 'checkAndIncrement')
        .mockResolvedValue(undefined);

      dbMock.account.findUnique.mockResolvedValue(null); // Từ chối sớm sau khi check limiter

      await flowService.verifyResetOtp(
        { email: validAccount.email, otp: rawOtpCode },
        '203.0.113.10',
      ).catch(() => {});
      expect(checkSpy).toHaveBeenCalledWith(
        'verify_reset_otp_ip:203.0.113.10',
        10,
        3600,
        expect.any(String),
      );

      await flowService.verifyResetOtp(
        { email: validAccount.email, otp: rawOtpCode },
        '203.0.113.20',
      ).catch(() => {});
      expect(checkSpy).toHaveBeenCalledWith(
        'verify_reset_otp_ip:203.0.113.20',
        10,
        3600,
        expect.any(String),
      );
    });

    it('OTP hợp lệ tạo đúng một reset grant ngẫu nhiên ngắn hạn, chỉ lưu hash và vô hiệu hóa challenge', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
      const activeChallenge = {
        id: 'ch-valid',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        expiresAt: new Date(Date.now() + 600000),
        attempts: 0,
        isUsed: false,
        deliveryStatus: 'delivered',
      };
      dbMock.otpChallenge.findFirst.mockResolvedValueOnce(activeChallenge);
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValueOnce(true);

      const result = await flowService.verifyResetOtp({
        email: '   Reset.User@example.com  ', // kiểm tra chuẩn hóa email
        otp: rawOtpCode,
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toBeDefined();
      expect(result.data.resetToken).toBeDefined();
      expect(typeof result.data.resetToken).toBe('string');
      expect(result.data.resetToken.length).toBe(64); // 32 bytes hex
      expect(result.data.expiresIn).toBe(900); // 15 phút

      // Challenge được cập nhật isUsed: true
      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: activeChallenge.id,
            isUsed: false,
          }),
          data: expect.objectContaining({
            isUsed: true,
          }),
        }),
      );

      // Reset grant được tạo với HASH (không lưu raw token)
      expect(dbMock.passwordResetGrant.create).toHaveBeenCalledOnce();
      const grantCreateArg = dbMock.passwordResetGrant.create.mock.calls[0][0];
      expect(grantCreateArg.data.accountId).toBe(validAccount.id);
      expect(grantCreateArg.data.isUsed).toBe(false);
      expect(grantCreateArg.data.tokenHash).not.toBe(result.data.resetToken);
      // Hash phải là SHA-256 của resetToken
      const expectedHash = crypto
        .createHash('sha256')
        .update(result.data.resetToken)
        .digest('hex');
      expect(grantCreateArg.data.tokenHash).toBe(expectedHash);
    });

    it('verifyResetOtp khi challengeUpdate.count = 0 (race condition trong transaction) trả về phản hồi lỗi chung', async () => {
      dbMock.account.findUnique.mockResolvedValue(validAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-race-used',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        deliveryStatus: 'delivered',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 0,
      });
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValue(true);

      // CAS updateMany trả count = 0 (bị request khác tranh chấp)
      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });

      await expectGenericOtpError(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      );
    });
  });

  describe('2. Đổi mật khẩu một lần (POST /auth/reset-password)', () => {
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawResetToken)
      .digest('hex');

    const validGrant = {
      id: 'grant-uuid-1',
      accountId: validAccount.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 900000),
      isUsed: false,
      createdAt: new Date(),
    };

    it.each([
      ['không tồn tại', () => dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce(null)],
      [
        'đã được sử dụng (isUsed: true)',
        () =>
          dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce({
            ...validGrant,
            isUsed: true,
          }),
      ],
      [
        'đã hết hạn',
        () =>
          dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce({
            ...validGrant,
            expiresAt: new Date(Date.now() - 5000),
          }),
      ],
    ])('từ chối khi resetToken %s', async (_, setupMock) => {
      setupMock();
      await expect(
        flowService.resetPassword({
          resetToken: rawResetToken,
          newPassword: 'NewPassword@123',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.VALIDATION_ERROR,
          }),
        }),
      );
      expect(dbMock.account.update).not.toHaveBeenCalled();
    });

    it('đổi mật khẩu thành công: cập nhật bcrypt hash, passwordChangedAt và thu hồi tất cả Refresh Session', async () => {
      dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce(validGrant);

      const response = await flowService.resetPassword({
        resetToken: rawResetToken,
        newPassword: 'BrandNewPassword@2026',
      });

      expect(response).toEqual({
        statusCode: HttpStatus.OK,
        message:
          'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.',
        data: null,
      });

      // 1. Grant được tiêu thụ bằng conditional CAS update
      expect(dbMock.passwordResetGrant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: validGrant.id,
            isUsed: false,
          }),
          data: expect.objectContaining({
            isUsed: true,
          }),
        }),
      );

      // 2. Mật khẩu tài khoản được cập nhật bcrypt hash mới
      expect(dbMock.account.update).toHaveBeenCalledOnce();
      const accountUpdateCall = dbMock.account.update.mock.calls[0][0];
      expect(accountUpdateCall.where.id).toBe(validAccount.id);
      expect(accountUpdateCall.data.passwordChangedAt).toBeInstanceOf(Date);
      expect(accountUpdateCall.data.passwordHash).toMatch(/^\$2[aby]\$\d+\$/);
      expect(accountUpdateCall.data.passwordHash).not.toBe(validAccount.passwordHash);

      // 3. Toàn bộ Refresh Session của tài khoản bị thu hồi
      expect(sessionService.revokeAllSessions).toHaveBeenCalledWith(
        validAccount.id,
        dbMock,
      );
    });

    it('từ chối với VALIDATION_ERROR khi grantUpdate.count = 0 (CAS fail / đã bị sử dụng đồng thời)', async () => {
      dbMock.passwordResetGrant.findUnique.mockResolvedValue(validGrant);
      dbMock.passwordResetGrant.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        flowService.resetPassword({
          resetToken: rawResetToken,
          newPassword: 'PasswordOne@123',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.VALIDATION_ERROR,
          }),
        }),
      );
    });
  });
});
