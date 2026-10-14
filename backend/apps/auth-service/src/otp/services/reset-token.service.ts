import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RESET_TOKEN_EXPIRES_IN_SECONDS } from '../../common/constants/auth.constants.js';

export const RESET_TOKEN_SERVICE = Symbol('RESET_TOKEN_SERVICE');

export interface GeneratedResetToken {
  rawToken: string;
  tokenHash: string;
  lifetimeSeconds: number;
  expiresAt: Date;
}

export interface IResetTokenService {
  generateResetToken(lifetimeSeconds?: number): GeneratedResetToken;
  hashToken(token: string): string;
}

@Injectable()
export class ResetTokenService implements IResetTokenService {
  generateResetToken(
    lifetimeSeconds: number = RESET_TOKEN_EXPIRES_IN_SECONDS,
  ): GeneratedResetToken {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);

    return {
      rawToken,
      tokenHash,
      lifetimeSeconds,
      expiresAt,
    };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
