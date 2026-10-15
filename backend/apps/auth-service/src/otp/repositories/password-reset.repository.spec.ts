import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PasswordResetRepository } from './password-reset.repository.js';
import type { AuthPrismaService } from '@app/database';

describe('PasswordResetRepository', () => {
  let repository: PasswordResetRepository;
  let dbMock: any;

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
      passwordResetGrant: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (cb) => cb(dbMock)),
    };

    repository = new PasswordResetRepository(
      dbMock as unknown as AuthPrismaService,
    );
  });

  describe('createResetChallenge (P0 race condition handling)', () => {
    it('executes row-level lock, invalidates old challenges, and creates new pending challenge inside transaction', async () => {
      dbMock.otpChallenge.updateMany.mockResolvedValueOnce({ count: 1 });
      dbMock.otpChallenge.create.mockResolvedValueOnce({ id: 'ch-new-id' });

      const input = {
        accountId: 'acc-1234',
        otpHash: 'hashed_otp_code',
        expiresAt: new Date(Date.now() + 600000),
        resendAvailableAt: new Date(Date.now() + 60000),
      };

      const result = await repository.createResetChallenge(input);

      expect(dbMock.$transaction).toHaveBeenCalledOnce();
      expect(dbMock.$queryRaw).toHaveBeenCalled();
      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith({
        where: {
          accountId: input.accountId,
          type: 'reset_password',
          isUsed: false,
        },
        data: {
          isUsed: true,
        },
      });
      expect(dbMock.otpChallenge.create).toHaveBeenCalledWith({
        data: {
          accountId: input.accountId,
          type: 'reset_password',
          otpHash: input.otpHash,
          expiresAt: input.expiresAt,
          resendAvailableAt: input.resendAvailableAt,
          isUsed: false,
          deliveryStatus: 'pending',
        },
      });
      expect(result).toEqual({ id: 'ch-new-id' });
    });
  });

  describe('updateChallengeDelivery', () => {
    it('updates delivery status and optional error', async () => {
      dbMock.otpChallenge.update.mockResolvedValueOnce({ id: 'ch-1' });

      await repository.updateChallengeDelivery('ch-1', 'delivered');
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'ch-1' },
        data: { deliveryStatus: 'delivered' },
      });

      await repository.updateChallengeDelivery('ch-1', 'failed', 'SMTP timeout');
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'ch-1' },
        data: { deliveryStatus: 'failed', deliveryError: 'SMTP timeout' },
      });
    });
  });

  describe('consumeChallengeAndCreateGrant', () => {
    it('returns false when challenge update count is 0 (CAS failure)', async () => {
      dbMock.otpChallenge.updateMany.mockResolvedValueOnce({ count: 0 });

      const success = await repository.consumeChallengeAndCreateGrant({
        challengeId: 'ch-1',
        accountId: 'acc-1',
        maxAttempts: 5,
        tokenHash: 'hash-1',
        grantExpiresAt: new Date(),
      });

      expect(success).toBe(false);
      expect(dbMock.passwordResetGrant.create).not.toHaveBeenCalled();
    });

    it('invalidates prior grants and creates new grant when challenge update succeeds', async () => {
      dbMock.otpChallenge.updateMany.mockResolvedValueOnce({ count: 1 });
      dbMock.passwordResetGrant.updateMany.mockResolvedValueOnce({ count: 1 });
      dbMock.passwordResetGrant.create.mockResolvedValueOnce({ id: 'grant-1' });

      const grantExpiresAt = new Date();
      const success = await repository.consumeChallengeAndCreateGrant({
        challengeId: 'ch-1',
        accountId: 'acc-1',
        maxAttempts: 5,
        tokenHash: 'hash-1',
        grantExpiresAt,
      });

      expect(success).toBe(true);
      expect(dbMock.passwordResetGrant.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', isUsed: false },
        data: { isUsed: true },
      });
      expect(dbMock.passwordResetGrant.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-1',
          tokenHash: 'hash-1',
          expiresAt: grantExpiresAt,
          isUsed: false,
        },
      });
    });
  });

  describe('completePasswordReset', () => {
    it('returns false when grant CAS update count is 0', async () => {
      dbMock.passwordResetGrant.updateMany.mockResolvedValueOnce({ count: 0 });
      const revokeMock = vi.fn();

      const success = await repository.completePasswordReset({
        grantId: 'g-1',
        accountId: 'acc-1',
        newPasswordHash: 'new-hash',
        updateTime: new Date(),
        revokeSessions: revokeMock,
      });

      expect(success).toBe(false);
      expect(dbMock.account.update).not.toHaveBeenCalled();
      expect(revokeMock).not.toHaveBeenCalled();
    });

    it('updates account password and revokes sessions when grant CAS update succeeds', async () => {
      dbMock.passwordResetGrant.updateMany.mockResolvedValueOnce({ count: 1 });
      dbMock.account.update.mockResolvedValueOnce({ id: 'acc-1' });
      const revokeMock = vi.fn().mockResolvedValue(undefined);

      const updateTime = new Date();
      const success = await repository.completePasswordReset({
        grantId: 'g-1',
        accountId: 'acc-1',
        newPasswordHash: 'new-hash',
        updateTime,
        revokeSessions: revokeMock,
      });

      expect(success).toBe(true);
      expect(dbMock.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: {
          passwordHash: 'new-hash',
          passwordChangedAt: updateTime,
          updatedAt: updateTime,
        },
      });
      expect(revokeMock).toHaveBeenCalledWith(dbMock);
    });
  });
});
