import { Injectable } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';

export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');

export interface EligibleAccountRecord {
  id: string;
  email: string | null;
  status: string;
  emailVerifiedAt: Date | null;
}

export interface ResetOtpChallengeRecord {
  id: string;
  accountId: string;
  type: string;
  otpHash: string;
  expiresAt: Date;
  resendAvailableAt?: Date | null;
  attempts: number;
  isUsed: boolean;
  deliveryStatus: string;
  deliveryError?: string | null;
  createdAt?: Date;
}

export interface PasswordResetGrantRecord {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  isUsed: boolean;
  usedAt?: Date | null;
  createdAt?: Date;
}

export interface CreateResetChallengeInput {
  accountId: string;
  otpHash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export interface IPasswordResetRepository {
  findAccountByEmail(email: string): Promise<EligibleAccountRecord | null>;
  createResetChallenge(input: CreateResetChallengeInput): Promise<{ id: string }>;
  updateChallengeDelivery(
    challengeId: string,
    status: 'delivered' | 'failed',
    error?: string,
  ): Promise<void>;
  findLatestResetChallenge(
    accountId: string,
  ): Promise<ResetOtpChallengeRecord | null>;
  incrementChallengeAttempts(
    challengeId: string,
    maxAttempts: number,
  ): Promise<void>;
  consumeChallengeAndCreateGrant(params: {
    challengeId: string;
    accountId: string;
    maxAttempts: number;
    tokenHash: string;
    grantExpiresAt: Date;
  }): Promise<boolean>;
  findGrantByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetGrantRecord | null>;
  completePasswordReset(params: {
    grantId: string;
    accountId: string;
    newPasswordHash: string;
    updateTime: Date;
    revokeSessions: (tx: any) => Promise<void>;
  }): Promise<boolean>;
}

@Injectable()
export class PasswordResetRepository implements IPasswordResetRepository {
  constructor(private readonly db: AuthPrismaService) {}

  private async runInTransaction<T>(
    operation: (tx: any) => Promise<T>,
  ): Promise<T> {
    if (typeof this.db.$transaction === 'function') {
      return this.db.$transaction(operation);
    }
    return operation(this.db);
  }

  async findAccountByEmail(email: string): Promise<EligibleAccountRecord | null> {
    return this.db.account.findUnique({
      where: { email },
    });
  }

  /**
   * Atomically invalidates old reset challenges and creates a new pending challenge.
   * Uses row-level lock on account (FOR UPDATE) to prevent race conditions during concurrent requests.
   */
  async createResetChallenge(
    input: CreateResetChallengeInput,
  ): Promise<{ id: string }> {
    return this.runInTransaction(async (tx) => {
      // 1. Acquire row-level lock on the account to serialize concurrent reset OTP requests
      if (typeof (tx as any).$queryRaw === 'function') {
        await (tx as any).$queryRaw`
          SELECT id
          FROM "auth_service"."accounts"
          WHERE id = ${input.accountId}::uuid
          FOR UPDATE
        `;
      }

      // 2. Invalidate any prior unused reset_password challenges for this account
      await tx.otpChallenge.updateMany({
        where: {
          accountId: input.accountId,
          type: 'reset_password',
          isUsed: false,
        },
        data: {
          isUsed: true,
        },
      });

      // 3. Atomically create the new challenge with deliveryStatus 'pending'
      return tx.otpChallenge.create({
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
    });
  }

  async updateChallengeDelivery(
    challengeId: string,
    status: 'delivered' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.db.otpChallenge.update({
      where: { id: challengeId },
      data: {
        deliveryStatus: status,
        ...(error !== undefined ? { deliveryError: error } : {}),
      },
    });
  }

  async findLatestResetChallenge(
    accountId: string,
  ): Promise<ResetOtpChallengeRecord | null> {
    return this.db.otpChallenge.findFirst({
      where: {
        accountId,
        type: 'reset_password',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementChallengeAttempts(
    challengeId: string,
    maxAttempts: number,
  ): Promise<void> {
    await this.runInTransaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: {
          id: challengeId,
          isUsed: false,
          deliveryStatus: 'delivered',
          expiresAt: { gt: new Date() },
          attempts: { lt: maxAttempts },
        },
        data: {
          attempts: { increment: 1 },
        },
      });
    });
  }

  async consumeChallengeAndCreateGrant(params: {
    challengeId: string;
    accountId: string;
    maxAttempts: number;
    tokenHash: string;
    grantExpiresAt: Date;
  }): Promise<boolean> {
    return this.runInTransaction(async (tx) => {
      const verifyTime = new Date();

      const challengeUpdate = await tx.otpChallenge.updateMany({
        where: {
          id: params.challengeId,
          isUsed: false,
          deliveryStatus: 'delivered',
          expiresAt: { gt: verifyTime },
          attempts: { lt: params.maxAttempts },
        },
        data: {
          isUsed: true,
          updatedAt: verifyTime,
        },
      });

      if (challengeUpdate.count === 0) {
        return false;
      }

      // Invalidate any previously unused grants for this account
      await tx.passwordResetGrant.updateMany({
        where: {
          accountId: params.accountId,
          isUsed: false,
        },
        data: {
          isUsed: true,
        },
      });

      // Create new single-use reset grant
      await tx.passwordResetGrant.create({
        data: {
          accountId: params.accountId,
          tokenHash: params.tokenHash,
          expiresAt: params.grantExpiresAt,
          isUsed: false,
        },
      });

      return true;
    });
  }

  async findGrantByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetGrantRecord | null> {
    return this.db.passwordResetGrant.findUnique({
      where: { tokenHash },
    });
  }

  async completePasswordReset(params: {
    grantId: string;
    accountId: string;
    newPasswordHash: string;
    updateTime: Date;
    revokeSessions: (tx: any) => Promise<void>;
  }): Promise<boolean> {
    return this.runInTransaction(async (tx) => {
      const grantUpdate = await tx.passwordResetGrant.updateMany({
        where: {
          id: params.grantId,
          isUsed: false,
          expiresAt: { gt: params.updateTime },
        },
        data: {
          isUsed: true,
          usedAt: params.updateTime,
        },
      });

      if (grantUpdate.count === 0) {
        return false;
      }

      await tx.account.update({
        where: { id: params.accountId },
        data: {
          passwordHash: params.newPasswordHash,
          passwordChangedAt: params.updateTime,
          updatedAt: params.updateTime,
        },
      });

      await params.revokeSessions(tx);
      return true;
    });
  }
}
