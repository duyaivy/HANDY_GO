import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { LoginFlowService } from './login-flow.service.js';

describe('LoginFlowService - Change Email Flow', () => {
  let service: LoginFlowService;
  let dbMock: any;
  let otpServiceMock: any;
  let rateLimiterMock: any;
  let lockoutServiceMock: any;
  let userTrustClientMock: any;
  let sessionServiceMock: any;

  const accountId = 'acc-123';
  const currentEmail = 'old@example.com';
  const newEmail = 'new@example.com';

  beforeEach(() => {
    dbMock = {
      account: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(dbMock)),
    };

    otpServiceMock = {
      generateOtp: vi.fn().mockReturnValue({
        code: '123456',
        hash: 'hashed-123456',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        resendAvailableAt: new Date(Date.now() + 60 * 1000),
      }),
      sendChangeEmailOtp: vi.fn().mockResolvedValue(undefined),
      verifyOtpHash: vi.fn(),
    };

    rateLimiterMock = {};
    lockoutServiceMock = {};
    userTrustClientMock = {};
    sessionServiceMock = {};

    service = new LoginFlowService(
      dbMock,
      rateLimiterMock,
      lockoutServiceMock,
      otpServiceMock,
      userTrustClientMock,
      sessionServiceMock,
    );
  });

  describe('requestChangeEmail', () => {
    it('throws if account does not exist', async () => {
      dbMock.account.findUnique.mockResolvedValue(null);

      await expect(
        service.requestChangeEmail(accountId, { newEmail }),
      ).rejects.toThrow(AppException);
    });

    it('throws if new email matches current email', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: accountId,
        email: currentEmail,
        status: 'active',
      });

      try {
        await service.requestChangeEmail(accountId, { newEmail: currentEmail });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    });

    it('throws if new email is already used by another account', async () => {
      dbMock.account.findUnique
        .mockResolvedValueOnce({
          id: accountId,
          email: currentEmail,
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'acc-other',
          email: newEmail,
          status: 'active',
        });

      try {
        await service.requestChangeEmail(accountId, { newEmail });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.EMAIL_ALREADY_EXISTS);
      }
    });

    it('throws 429 RATE_LIMIT_EXCEEDED if resend cooldown has not expired', async () => {
      dbMock.account.findUnique
        .mockResolvedValueOnce({
          id: accountId,
          email: currentEmail,
          status: 'active',
        })
        .mockResolvedValueOnce(null); // new email not taken

      // An active challenge with future resendAvailableAt exists
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        resendAvailableAt: new Date(Date.now() + 45 * 1000),
      });

      try {
        await service.requestChangeEmail(accountId, { newEmail });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.RATE_LIMITED);
      }
    });

    it('generates OTP and returns cooldownSeconds and resendAvailableAt on success', async () => {
      dbMock.account.findUnique
        .mockResolvedValueOnce({
          id: accountId,
          email: currentEmail,
          status: 'active',
        })
        .mockResolvedValueOnce(null);

      dbMock.otpChallenge.findFirst.mockResolvedValue(null);
      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });
      dbMock.otpChallenge.create.mockResolvedValue({ id: 'ch-new' });

      const res = await service.requestChangeEmail(accountId, { newEmail });

      expect(res.statusCode).toBe(HttpStatus.OK);
      expect(res.data.newEmail).toBe(newEmail);
      expect(res.data.resendAvailableAt).toBeDefined();
      expect(res.data.cooldownSeconds).toBeGreaterThanOrEqual(0);
      expect(otpServiceMock.sendChangeEmailOtp).toHaveBeenCalledWith(
        newEmail,
        '123456',
      );
    });
  });

  describe('confirmChangeEmail', () => {
    it('throws if OTP challenge expired or does not exist', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: accountId,
        email: currentEmail,
        status: 'active',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue(null);

      try {
        await service.confirmChangeEmail(accountId, { newEmail, otp: '123456' });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.OTP_INVALID);
      }
    });

    it('throws 429 if attempts exceed 5', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: accountId,
        email: currentEmail,
        status: 'active',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        attempts: 5,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      try {
        await service.confirmChangeEmail(accountId, { newEmail, otp: '123456' });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.OTP_ATTEMPTS_EXCEEDED);
      }
    });

    it('increments attempts if OTP does not match', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: accountId,
        email: currentEmail,
        status: 'active',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        attempts: 1,
        otpHash: 'hashed-code',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      otpServiceMock.verifyOtpHash.mockReturnValue(false);
      dbMock.otpChallenge.update.mockResolvedValue({});

      try {
        await service.confirmChangeEmail(accountId, { newEmail, otp: 'wrong-otp' });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.OTP_INVALID);
      }

      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { attempts: { increment: 1 } },
        }),
      );
    });

    it('atomically consumes challenge and updates account email on valid OTP', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: accountId,
        email: currentEmail,
        status: 'active',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        attempts: 1,
        otpHash: 'hashed-code',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      otpServiceMock.verifyOtpHash.mockReturnValue(true);
      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
      dbMock.account.update.mockResolvedValue({});

      const res = await service.confirmChangeEmail(accountId, {
        newEmail,
        otp: '123456',
      });

      expect(res.statusCode).toBe(HttpStatus.OK);
      expect(res.data.email).toBe(newEmail);
      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: 'ch-1', isUsed: false },
        data: { isUsed: true },
      });
    });

    it('throws if concurrent confirmation already consumed challenge (atomic race condition)', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: accountId,
        email: currentEmail,
        status: 'active',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        attempts: 1,
        otpHash: 'hashed-code',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      otpServiceMock.verifyOtpHash.mockReturnValue(true);
      // Another concurrent process won the race and consumed it (count = 0)
      dbMock.otpChallenge.updateMany.mockResolvedValue({ count: 0 });

      try {
        await service.confirmChangeEmail(accountId, { newEmail, otp: '123456' });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.OTP_INVALID);
      }
    });

    it('throws if another account claimed the new email in the meantime (uniqueness race)', async () => {
      dbMock.account.findUnique
        .mockResolvedValueOnce({
          id: accountId,
          email: currentEmail,
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'acc-racing-thief',
          email: newEmail,
          status: 'active',
        });

      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        attempts: 1,
        otpHash: 'hashed-code',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      otpServiceMock.verifyOtpHash.mockReturnValue(true);

      try {
        await service.confirmChangeEmail(accountId, { newEmail, otp: '123456' });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect((err.getResponse() as any).code).toBe(ERROR_CODES.EMAIL_ALREADY_EXISTS);
      }
    });
  });
});
