import { describe, expect, it, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { OtpFlowService } from './otp-flow.service.js';
import { OtpService } from './otp.service.js';
import { OtpController } from './otp.controller.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { UserTrustClient } from '../common/rpc/user-trust.client.js';
import { SessionService } from '../common/session/session.service.js';

describe('OTP Verification & Single-Use Password Reset Flow (HG-31 Phase 5)', () => {
  let module: TestingModule;
  let flowService: OtpFlowService;
  let otpService: OtpService;
  let sessionService: SessionService;
  let controller: OtpController;
  let dbMock: any;
  let configMock: any;

  const validAccount = {
    id: 'acc-uuid-1111-2222',
    userId: 'usr-uuid-1111-2222',
    email: 'reset.user@example.com',
    phone: '0912345678',
    passwordHash: '$2b$10$oldHashValueOldPasswordOldPasswordOldPasswordOldPassw',
    status: 'active',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    passwordChangedAt: null,
  };

  const rawOtpCode = '654321';
  const hashedOtpCode = 'hmac_sha256_mock_hash_for_654321';

  beforeEach(async () => {
    dbMock = {
      account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn().mockImplementation((args) => Promise.resolve({ ...validAccount, ...args.data })),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn().mockImplementation((args) =>
          Promise.resolve({ id: 'challenge-new-uuid', ...args.data }),
        ),
        update: vi.fn().mockImplementation((args) =>
          Promise.resolve({ id: args.where.id, ...args.data }),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetGrant: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn().mockImplementation((args) =>
          Promise.resolve({ id: 'grant-new-uuid', ...args.data }),
        ),
        update: vi.fn().mockImplementation((args) =>
          Promise.resolve({ id: args.where.id, ...args.data }),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      refreshSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
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

    const sessionServiceMock = {
      revokeAllSessions: vi.fn().mockImplementation(async (accountId, tx) => {
        const client = tx ?? dbMock;
        await client.refreshSession.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }),
    };

    module = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        OtpFlowService,
        OtpService,
        { provide: RateLimiterService, useValue: { checkAndIncrement: vi.fn().mockResolvedValue(undefined) } },
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: ConfigService, useValue: configMock },
        { provide: UserTrustClient, useValue: { confirmUserStatus: vi.fn() } },
        { provide: SessionService, useValue: sessionServiceMock },
      ],
    }).compile();

    flowService = module.get<OtpFlowService>(OtpFlowService);
    otpService = module.get<OtpService>(OtpService);
    sessionService = module.get<SessionService>(SessionService);
    controller = module.get<OtpController>(OtpController);
  });

  it('khởi tạo thành công OtpController và flowService', () => {
    expect(controller).toBeDefined();
    expect(flowService).toBeDefined();
  });

  describe('1. Kiểm tra xác thực OTP (POST /auth/verify-reset-otp)', () => {
    it('từ chối khi tài khoản không tồn tại', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(null);

      await expect(
        flowService.verifyResetOtp({
          email: 'unknown@example.com',
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.INVALID_CREDENTIALS,
          }),
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('từ chối khi tài khoản bị khóa (locked, suspended, deleted)', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce({
        ...validAccount,
        status: 'locked',
      });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          response: expect.objectContaining({
            code: ERROR_CODES.ACCOUNT_BLOCKED,
          }),
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('từ chối khi OTP chưa được gửi thành công (deliveryStatus !== delivered)', async () => {
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

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_INVALID,
          }),
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('từ chối với OTP_ALREADY_USED khi OTP đã được sử dụng', async () => {
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

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ALREADY_USED,
          }),
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('từ chối với OTP_EXPIRED khi OTP đã hết hạn', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce(validAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValueOnce({
        id: 'ch-expired',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        expiresAt: new Date(Date.now() - 5000), // đã hết hạn
        attempts: 0,
        isUsed: false,
        deliveryStatus: 'delivered',
      });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_EXPIRED,
          }),
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('từ chối với OTP_ATTEMPTS_EXCEEDED khi đã vượt quá 5 lần thử', async () => {
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

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
          }),
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('từ chối và tăng số lần thử nguyên tử khi OTP sai mã', async () => {
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
      dbMock.otpChallenge.findUnique.mockResolvedValueOnce({ attempts: 2 });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: '999999',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_INVALID,
          }),
        }),
      );

      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: activeChallenge.id,
            isUsed: false,
            deliveryStatus: 'delivered',
          }),
          data: {
            attempts: { increment: 1 },
          },
        }),
      );
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
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
      const expectedHash = crypto.createHash('sha256').update(result.data.resetToken).digest('hex');
      expect(grantCreateArg.data.tokenHash).toBe(expectedHash);
    });

    it('OTP không thể xác minh lần thứ hai (chống replay attack)', async () => {
      dbMock.account.findUnique.mockResolvedValue(validAccount);
      const activeChallenge = {
        id: 'ch-replay',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        expiresAt: new Date(Date.now() + 600000),
        attempts: 0,
        isUsed: false,
        deliveryStatus: 'delivered',
      };
      dbMock.otpChallenge.findFirst.mockResolvedValueOnce(activeChallenge);
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValue(true);

      // Lần 1: thành công
      await flowService.verifyResetOtp({
        email: validAccount.email,
        otp: rawOtpCode,
      });

      // Lần 2: challenge đã đánh dấu isUsed = true
      dbMock.otpChallenge.findFirst.mockResolvedValueOnce({
        ...activeChallenge,
        isUsed: true,
      });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ALREADY_USED,
          }),
        }),
      );
    });

    it('nhập sai OTP lần thứ 5 trả về 429 OTP_ATTEMPTS_EXCEEDED với remainingAttempts = 0', async () => {
      dbMock.account.findUnique.mockResolvedValue(validAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-wrong-code-5',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        deliveryStatus: 'delivered',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 4, // Lần này sai sẽ chạm mốc 5
      });

      // Transaction CAS update attempts từ 4 -> 5
      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
      dbMock.otpChallenge.findUnique.mockResolvedValue({ attempts: 5 });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: '000000', // Sai OTP
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
            data: { remainingAttempts: 0 },
          }),
        }),
      );
    });

    it('verifyResetOtp khi challengeUpdate.count = 0 do challenge đã bị dùng (race condition) ném OTP_ALREADY_USED', async () => {
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

      // CAS updateMany trả count = 0 (bị request khác dùng trước)
      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });
      dbMock.otpChallenge.findUnique.mockResolvedValue({
        id: 'challenge-race-used',
        isUsed: true,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 0,
      });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ALREADY_USED,
          }),
        }),
      );
    });

    it('verifyResetOtp khi challengeUpdate.count = 0 do attempts >= maxAttempts ném OTP_ATTEMPTS_EXCEEDED', async () => {
      dbMock.account.findUnique.mockResolvedValue(validAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-race-exceeded',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        deliveryStatus: 'delivered',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 0,
      });
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValue(true);

      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });
      dbMock.otpChallenge.findUnique.mockResolvedValue({
        id: 'challenge-race-exceeded',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 5,
      });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
          }),
        }),
      );
    });

    it('verifyResetOtp khi challengeUpdate.count = 0 do hết hạn trong lúc xử lý ném OTP_EXPIRED', async () => {
      dbMock.account.findUnique.mockResolvedValue(validAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-race-expired',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        deliveryStatus: 'delivered',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 0,
      });
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValue(true);

      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });
      dbMock.otpChallenge.findUnique.mockResolvedValue({
        id: 'challenge-race-expired',
        isUsed: false,
        expiresAt: new Date(Date.now() - 5000), // đã hết hạn
        attempts: 0,
      });

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_EXPIRED,
          }),
        }),
      );
    });

    it('verifyResetOtp khi challengeUpdate.count = 0 và findUnique trả null ném OTP_ALREADY_USED', async () => {
      dbMock.account.findUnique.mockResolvedValue(validAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-race-null',
        accountId: validAccount.id,
        type: 'reset_password',
        otpHash: hashedOtpCode,
        deliveryStatus: 'delivered',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 0,
      });
      vi.spyOn(otpService, 'verifyOtpHash').mockReturnValue(true);

      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });
      dbMock.otpChallenge.findUnique.mockResolvedValue(null);

      await expect(
        flowService.verifyResetOtp({
          email: validAccount.email,
          otp: rawOtpCode,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: expect.objectContaining({
            code: ERROR_CODES.OTP_ALREADY_USED,
          }),
        }),
      );
    });
  });

  describe('2. Đổi mật khẩu một lần (POST /auth/reset-password)', () => {
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');

    const validGrant = {
      id: 'grant-uuid-1',
      accountId: validAccount.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 900000),
      isUsed: false,
      createdAt: new Date(),
    };

    it('từ chối khi resetToken không tồn tại', async () => {
      dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce(null);

      await expect(
        flowService.resetPassword({
          resetToken: 'invalid-nonexistent-token',
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

    it('từ chối khi resetToken đã được sử dụng (isUsed: true)', async () => {
      dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce({
        ...validGrant,
        isUsed: true,
      });

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

    it('từ chối khi resetToken đã hết hạn', async () => {
      dbMock.passwordResetGrant.findUnique.mockResolvedValueOnce({
        ...validGrant,
        expiresAt: new Date(Date.now() - 5000),
      });

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
        message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.',
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

      // Xác thực hash mới khớp với mật khẩu mới qua bcrypt
      const isBcryptMatch = await bcrypt.compare(
        'BrandNewPassword@2026',
        accountUpdateCall.data.passwordHash,
      );
      expect(isBcryptMatch).toBe(true);

      // Mật khẩu cũ không còn khớp
      const isOldMatch = await bcrypt.compare(
        'OldPassword123',
        accountUpdateCall.data.passwordHash,
      );
      expect(isOldMatch).toBe(false);

      // 3. Toàn bộ Refresh Session của tài khoản bị thu hồi
      expect(sessionService.revokeAllSessions).toHaveBeenCalledWith(
        validAccount.id,
        dbMock,
      );
    });

    it('hai request reset đồng thời với cùng grant: chỉ đúng một request thành công', async () => {
      dbMock.passwordResetGrant.findUnique.mockResolvedValue(validGrant);

      let updateAttempts = 0;
      dbMock.passwordResetGrant.updateMany.mockImplementation(() => {
        updateAttempts++;
        // Request đầu tiên update được (count = 1), request thứ hai thất bại (count = 0)
        return Promise.resolve({ count: updateAttempts === 1 ? 1 : 0 });
      });

      const p1 = flowService.resetPassword({
        resetToken: rawResetToken,
        newPassword: 'PasswordOne@123',
      });

      const p2 = flowService.resetPassword({
        resetToken: rawResetToken,
        newPassword: 'PasswordTwo@123',
      });

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(AppException);
      expect((rejectedError as AppException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((rejectedError as AppException).getResponse()).toMatchObject({
        code: ERROR_CODES.VALIDATION_ERROR,
      });
    });

    it('sau reset, refresh session cũ có revokedAt != null bị từ chối 401', async () => {
      // Giả lập trạng thái session sau khi bị revokeAllSessions
      const _revokedSession = {
        id: 'sess-old-uuid',
        accountId: validAccount.id,
        refreshTokenHash: 'hash_of_old_refresh_token',
        revokedAt: new Date(), // đã bị thu hồi do đổi mật khẩu
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        createdAt: new Date(),
      };

      // Khi session có revokedAt khác null, sessionService.rotateSession tìm kiếm revokedAt: null sẽ không thấy
      dbMock.refreshSession.findFirst = vi.fn().mockResolvedValue(null);

      // Khởi tạo real SessionService để test hành vi rotate với DB mock
      const realSessionService = new SessionService(
        dbMock,
        {
          hashToken: vi.fn((token: string) => `hash_${token}`),
          signRefreshToken: vi.fn(),
          signAccessToken: vi.fn(),
        } as any,
        { confirmUserStatus: vi.fn() } as any,
      );

      await expect(
        realSessionService.rotateSession('old_plain_refresh_token'),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          response: expect.objectContaining({
            code: ERROR_CODES.INVALID_REFRESH_TOKEN,
          }),
        }),
      );
    });
  });
});
