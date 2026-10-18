import { describe, expect, it, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PasswordResetFlowService } from './password-reset-flow.service.js';
import { PASSWORD_RESET_REPOSITORY } from './repositories/password-reset.repository.js';
import { PASSWORD_HASHER } from '../common/security/password-hasher.js';
import { RESET_TOKEN_SERVICE } from './services/reset-token.service.js';
import { PASSWORD_RESET_EMAIL_DISPATCHER } from './services/password-reset-email.dispatcher.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { SessionService } from '../common/session/session.service.js';
import { OtpService } from './otp.service.js';

describe('PasswordResetFlowService - Dependency Inversion Principle (DIP) Verification', () => {
  let module: TestingModule;
  let service: PasswordResetFlowService;

  let repoMock: {
    findAccountByEmail: ReturnType<typeof vi.fn>;
    createResetChallenge: ReturnType<typeof vi.fn>;
    updateChallengeDelivery: ReturnType<typeof vi.fn>;
    findLatestResetChallenge: ReturnType<typeof vi.fn>;
    incrementChallengeAttempts: ReturnType<typeof vi.fn>;
    consumeChallengeAndCreateGrant: ReturnType<typeof vi.fn>;
    findGrantByTokenHash: ReturnType<typeof vi.fn>;
    completePasswordReset: ReturnType<typeof vi.fn>;
  };

  let hasherMock: {
    hash: ReturnType<typeof vi.fn>;
    compare: ReturnType<typeof vi.fn>;
  };

  let tokenServiceMock: {
    generateResetToken: ReturnType<typeof vi.fn>;
    hashToken: ReturnType<typeof vi.fn>;
  };

  let emailDispatcherMock: {
    sendResetEmail: ReturnType<typeof vi.fn>;
    simulateEmailDispatchDelay: ReturnType<typeof vi.fn>;
  };

  let rateLimiterMock: {
    checkAndIncrement: ReturnType<typeof vi.fn>;
  };

  let sessionServiceMock: {
    revokeAllSessions: ReturnType<typeof vi.fn>;
  };

  let otpServiceMock: {
    hashEmail: ReturnType<typeof vi.fn>;
    generateOtp: ReturnType<typeof vi.fn>;
    verifyOtpHash: ReturnType<typeof vi.fn>;
    maxAttempts: number;
  };

  beforeEach(async () => {
    repoMock = {
      findAccountByEmail: vi.fn(),
      createResetChallenge: vi.fn(),
      updateChallengeDelivery: vi.fn(),
      findLatestResetChallenge: vi.fn(),
      incrementChallengeAttempts: vi.fn(),
      consumeChallengeAndCreateGrant: vi.fn(),
      findGrantByTokenHash: vi.fn(),
      completePasswordReset: vi.fn(),
    };

    hasherMock = {
      hash: vi.fn().mockResolvedValue('hashed_new_password_mock'),
      compare: vi.fn().mockResolvedValue(true),
    };

    tokenServiceMock = {
      generateResetToken: vi.fn().mockReturnValue({
        rawToken: 'mock_raw_token_64_chars',
        tokenHash: 'mock_token_hash_64_chars',
        lifetimeSeconds: 900,
        expiresAt: new Date(Date.now() + 900000),
      }),
      hashToken: vi.fn().mockReturnValue('mock_token_hash_64_chars'),
    };

    emailDispatcherMock = {
      sendResetEmail: vi.fn().mockResolvedValue(undefined),
      simulateEmailDispatchDelay: vi.fn().mockResolvedValue(undefined),
    };

    rateLimiterMock = {
      checkAndIncrement: vi.fn().mockResolvedValue(undefined),
    };

    sessionServiceMock = {
      revokeAllSessions: vi.fn().mockResolvedValue(undefined),
    };

    otpServiceMock = {
      hashEmail: vi.fn((email: string) => `hmac_${email}`),
      generateOtp: vi.fn().mockReturnValue({
        code: '123456',
        hash: 'mock_otp_hash',
        expiresAt: new Date(Date.now() + 600000),
        resendAvailableAt: new Date(Date.now() + 60000),
      }),
      verifyOtpHash: vi.fn((plain: string, hash: string) => hash === `mock_otp_hash`),
      maxAttempts: 5,
    };

    module = await Test.createTestingModule({
      providers: [
        PasswordResetFlowService,
        { provide: PASSWORD_RESET_REPOSITORY, useValue: repoMock },
        { provide: PASSWORD_HASHER, useValue: hasherMock },
        { provide: RESET_TOKEN_SERVICE, useValue: tokenServiceMock },
        { provide: PASSWORD_RESET_EMAIL_DISPATCHER, useValue: emailDispatcherMock },
        { provide: RateLimiterService, useValue: rateLimiterMock },
        { provide: SessionService, useValue: sessionServiceMock },
        { provide: OtpService, useValue: otpServiceMock },
      ],
    }).compile();

    service = module.get<PasswordResetFlowService>(PasswordResetFlowService);
  });

  it('forgotPassword coordinates DIP abstractions cleanly without concrete database/crypto/smtp', async () => {
    repoMock.findAccountByEmail.mockResolvedValueOnce({
      id: 'acc-test-dip',
      email: 'dip.user@example.com',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    repoMock.createResetChallenge.mockResolvedValueOnce({ id: 'ch-test-dip' });

    const response = await service.forgotPassword(
      { email: 'dip.user@example.com' },
      '::ffff:203.0.113.195', // tests IP normalization
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    // Rate limiter was called with normalized IPv4
    expect(rateLimiterMock.checkAndIncrement).toHaveBeenCalledWith(
      'forgot_password_ip:203.0.113.195',
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
    );
    expect(repoMock.createResetChallenge).toHaveBeenCalledWith({
      accountId: 'acc-test-dip',
      otpHash: 'mock_otp_hash',
      expiresAt: expect.any(Date),
      resendAvailableAt: expect.any(Date),
    });
    expect(emailDispatcherMock.sendResetEmail).toHaveBeenCalledWith(
      'dip.user@example.com',
      '123456',
    );
    expect(repoMock.updateChallengeDelivery).toHaveBeenCalledWith(
      'ch-test-dip',
      'delivered',
    );
  });

  it('forgotPassword simulates timing equalization when account is ineligible', async () => {
    repoMock.findAccountByEmail.mockResolvedValueOnce(null);

    const response = await service.forgotPassword(
      { email: 'nonexistent@example.com' },
      '127.0.0.1',
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(emailDispatcherMock.simulateEmailDispatchDelay).toHaveBeenCalledOnce();
    expect(repoMock.createResetChallenge).not.toHaveBeenCalled();
    expect(emailDispatcherMock.sendResetEmail).not.toHaveBeenCalled();
  });

  it('verifyResetOtp uses IResetTokenService and IPasswordResetRepository abstractions', async () => {
    repoMock.findAccountByEmail.mockResolvedValueOnce({
      id: 'acc-test-dip',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    repoMock.findLatestResetChallenge.mockResolvedValueOnce({
      id: 'ch-valid',
      accountId: 'acc-test-dip',
      otpHash: 'mock_otp_hash',
      expiresAt: new Date(Date.now() + 600000),
      deliveryStatus: 'delivered',
      isUsed: false,
      attempts: 0,
    });
    repoMock.consumeChallengeAndCreateGrant.mockResolvedValueOnce(true);

    const response = await service.verifyResetOtp(
      { email: 'dip.user@example.com', otp: '123456' },
      '127.0.0.1',
    );

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(tokenServiceMock.generateResetToken).toHaveBeenCalledOnce();
    expect(repoMock.consumeChallengeAndCreateGrant).toHaveBeenCalledWith({
      challengeId: 'ch-valid',
      accountId: 'acc-test-dip',
      maxAttempts: 5,
      tokenHash: 'mock_token_hash_64_chars',
      grantExpiresAt: expect.any(Date),
    });
    expect(response.data.resetToken).toBe('mock_raw_token_64_chars');
    expect(response.data.expiresIn).toBe(900);
  });

  it('resetPassword uses IPasswordHasher and completes reset through repository', async () => {
    repoMock.findGrantByTokenHash.mockResolvedValueOnce({
      id: 'grant-test-dip',
      accountId: 'acc-test-dip',
      tokenHash: 'mock_token_hash_64_chars',
      expiresAt: new Date(Date.now() + 600000),
      isUsed: false,
    });
    repoMock.completePasswordReset.mockResolvedValueOnce(true);

    const response = await service.resetPassword({
      resetToken: 'mock_raw_token_64_chars',
      newPassword: 'MyNewPassword@2026',
    });

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(tokenServiceMock.hashToken).toHaveBeenCalledWith('mock_raw_token_64_chars');
    expect(hasherMock.hash).toHaveBeenCalledWith('MyNewPassword@2026');
    expect(repoMock.completePasswordReset).toHaveBeenCalledWith({
      grantId: 'grant-test-dip',
      accountId: 'acc-test-dip',
      newPasswordHash: 'hashed_new_password_mock',
      updateTime: expect.any(Date),
      revokeSessions: expect.any(Function),
    });
  });
});
