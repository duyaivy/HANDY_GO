import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import {
  AuthModule,
  AuthSignerModule,
  TokenSignerService,
  TokenVerifierService,
} from '@app/auth';
import { AuthPrismaService } from '@app/database';
import { RabbitMQService } from '@app/rabbitmq';
import { AuthServiceService } from '../src/auth-service.service.js';
import { OtpService } from '../src/otp/otp.service.js';
import { OutboxPublisherService } from '@app/common';
import { RateLimiterService } from '../src/common/rate-limit/rate-limiter.service.js';
import { LoginLockoutService } from '../src/common/security/login-lockout.service.js';
import { AuthServiceController } from '../src/auth-service.controller.js';
import { ConfigService } from '@app/config';
import { RegisterFlowService } from '../src/register/register-flow.service.js';
import { OtpFlowService } from '../src/otp/otp-flow.service.js';
import { LoginFlowService } from '../src/login/login-flow.service.js';
import { SessionService } from '../src/common/session/session.service.js';
import { UserTrustClient } from '../src/common/rpc/user-trust.client.js';

describe('Auth Service DI, RS256 Signing & DB Atomicity', () => {
  let module: TestingModule;
  let authService: AuthServiceService;
  let verifier: TokenVerifierService;
  let dbMock: any;
  let otpServiceMock: any;
  let outboxPublisherMock: any;
  let rateLimiterMock: any;
  let rabbitmqMock: any;

  beforeEach(async () => {
    dbMock = {
      account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      role: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },

      refreshSession: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.data.id ?? 'sess-1', ...args.data })),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(dbMock)),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };

    otpServiceMock = {
      generateOtp: vi.fn().mockReturnValue({
        code: '123456',
        hash: 'mock_otp_hash',
        expiresAt: new Date(Date.now() + 600000),
        resendAvailableAt: new Date(Date.now() + 60000),
      }),
      verifyOtpHash: vi.fn((plain: string, hash: string) => hash === `hashed_${plain}`),
      sendVerificationOtp: vi.fn().mockResolvedValue(undefined),
      maskEmail: vi.fn((email: string) => email),
    };

    outboxPublisherMock = {
      triggerPublish: vi.fn().mockResolvedValue(undefined),
    };

    rateLimiterMock = {
      checkAndIncrement: vi.fn().mockResolvedValue({
        currentCount: 1,
        remaining: 9,
        resetInSeconds: 3600,
      }),
      checkFailedLogins: vi.fn().mockResolvedValue(undefined),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      resetFailedLogins: vi.fn().mockResolvedValue(undefined),
      checkResendLimit: vi.fn().mockResolvedValue(undefined),
      getRemainingCooldown: vi.fn().mockResolvedValue(0),
      reset: vi.fn().mockResolvedValue(undefined),
    };

    rabbitmqMock = {
      send: vi.fn().mockResolvedValue({
        exists: true,
        status: 'active',
        isProvisioned: true,
      }),
    };

    // Build real module graph: imports AuthModule & AuthSignerModule with REAL TokenSignerService
    module = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
      controllers: [AuthServiceController],
      providers: [
        AuthServiceService,
        RegisterFlowService,
        OtpFlowService,
        LoginFlowService,
        SessionService,
        UserTrustClient,
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: OtpService, useValue: otpServiceMock },
        { provide: OutboxPublisherService, useValue: outboxPublisherMock },
        { provide: RateLimiterService, useValue: rateLimiterMock },
        LoginLockoutService,
        { provide: RabbitMQService, useValue: rabbitmqMock },
        {
          provide: ConfigService,
          useValue: {
            internalServiceSecret: 'test-secret',
            otpSecret: 'test-otp-secret',
          },
        },
      ],
    }).compile();


    authService = module.get<AuthServiceService>(AuthServiceService);
    verifier = module.get<TokenVerifierService>(TokenVerifierService);
  });

  it('1. Dependency Injection: AuthServiceService directly receives real TokenSignerService with valid private key', () => {
    expect(authService).toBeDefined();

    // Check the actual injected dependency on AuthServiceService instance
    const injectedSigner = (authService as any).tokenSigner;
    expect(injectedSigner).toBeDefined();
    expect(injectedSigner).toBeInstanceOf(TokenSignerService);

    // Verify it is not an unequipped verifier-only service
    expect(typeof injectedSigner.signAccessToken).toBe('function');
    expect(typeof injectedSigner.generateRefreshToken).toBe('function');
    expect(typeof injectedSigner.hashToken).toBe('function');
  });

  it('2. Login with real signer produces RS256 JWT that TokenVerifierService successfully verifies', async () => {
    const rawPassword = 'Password123@';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const mockAccount = {
      id: 'acc-real-signer-1',
      userId: 'user-real-signer-1',
      phone: '+84912345678',
      email: 'user@example.com',
      passwordHash,
      emailVerifiedAt: new Date(),
      status: 'active',
      roles: [
        {
          role: {
            name: 'Customer',
            permissionRoles: [{ permission: { code: 'auth:me' } }],
          },
        },
      ],
    };

    dbMock.account.findUnique.mockResolvedValue(mockAccount);

    const result: any = await authService.login({
      phone: '0912345678',
      password: rawPassword,
    });

    expect(result.statusCode).toBe(200);
    expect(result.data.accessToken).toBeDefined();
    expect(result.data.refreshToken).toBeDefined();

    // Verify token with real verifier
    const decoded = await verifier.verifyAccessToken(result.data.accessToken);
    expect(decoded.sub).toBe('acc-real-signer-1');
    expect(decoded.userId).toBe('user-real-signer-1');
    expect(decoded.roles).toEqual(['Customer']);
    expect(decoded.permissions).toEqual(['auth:me']);
    expect(decoded.iss).toBe('handy-go-auth');
    expect(decoded.aud).toBe('handy-go-api');
  });

  it('3. VerifyEmail with real signer produces RS256 JWT that TokenVerifierService successfully verifies', async () => {
    const mockAccount = {
      id: 'acc-verify-1',
      userId: 'user-verify-1',
      phone: '+84912345678',
      email: 'user@example.com',
      emailVerifiedAt: null,
      status: 'pending',
      roles: [{ role: { name: 'Customer', permissionRoles: [] } }],
      otpChallenges: [
        {
          id: 'otp-1',
          otpHash: 'hashed_123456',
          attempts: 0,
          expiresAt: new Date(Date.now() + 600000),
          isUsed: false,
        },
      ],
    };

    dbMock.account.findFirst.mockResolvedValue(mockAccount);
    dbMock.otpChallenge.findFirst.mockResolvedValue({
      id: 'otp-1',
      otpHash: 'hashed_123456',
      attempts: 0,
      expiresAt: new Date(Date.now() + 600000),
      isUsed: false,
      deliveryStatus: 'delivered',
    });


    const result: any = await authService.verifyEmail({
      phone: '0912345678',
      otp: '123456',
    });

    expect(result.statusCode).toBe(200);
    expect(result.data.accessToken).toBeDefined();

    const decoded = await verifier.verifyAccessToken(result.data.accessToken);
    expect(decoded.sub).toBe('acc-verify-1');
    expect(decoded.roles).toEqual(['Customer']);
  });

  it('4. Refresh with real signer produces new RS256 JWT that TokenVerifierService successfully verifies', async () => {
    const rawOldRefreshToken = 'old-plain-refresh-token';
    const hashed = (authService as any).tokenSigner.hashToken(rawOldRefreshToken);
    const mockAccount = {
      id: 'acc-refresh-1',
      userId: 'user-refresh-1',
      phone: '+84912345678',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      status: 'active',
      roles: [{ role: { name: 'Customer', permissionRoles: [] } }],
    };

    dbMock.refreshSession.findFirst.mockResolvedValue({
      id: 'sess-existing-1',
      refreshTokenHash: hashed,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      account: mockAccount,
    });
    dbMock.account.findUnique.mockResolvedValue(mockAccount);
    dbMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    const result: any = await authService.refresh({
      refreshToken: rawOldRefreshToken,
    });

    expect(result.statusCode).toBe(200);
    expect(result.data.accessToken).toBeDefined();

    const decoded = await verifier.verifyAccessToken(result.data.accessToken);
    expect(decoded.sub).toBe('acc-refresh-1');
  });

  it('5. Verifier-only service starts without needing private key or signer', async () => {
    const verifierModule: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    const tokenVerifier = verifierModule.get<TokenVerifierService>(TokenVerifierService);
    expect(tokenVerifier).toBeDefined();
    expect(() => verifierModule.get<TokenSignerService>(TokenSignerService)).toThrow();
  });

  it('6. Atomicity: If token signing fails in verifyEmail, database changes are NOT committed', async () => {
    const mockAccount = {
      id: 'acc-verify-fail-1',
      userId: 'user-verify-fail-1',
      phone: '+84912345678',
      email: 'user@example.com',
      emailVerifiedAt: null,
      status: 'pending',
      roles: [{ role: { name: 'Customer', permissionRoles: [] } }],
      otpChallenges: [
        {
          id: 'otp-challenge-fail-1',
          otpHash: 'hashed_123456',
          attempts: 0,
          expiresAt: new Date(Date.now() + 600000),
          isUsed: false,
        },
      ],
    };

    dbMock.account.findFirst.mockResolvedValue(mockAccount);
    dbMock.otpChallenge.findFirst.mockResolvedValue({
      id: 'otp-challenge-fail-1',
      otpHash: 'hashed_123456',
      attempts: 0,
      expiresAt: new Date(Date.now() + 600000),
      isUsed: false,
      deliveryStatus: 'delivered',
    });


    // Simulate signing failure
    vi.spyOn((authService as any).tokenSigner, 'signAccessToken').mockRejectedValueOnce(
      new Error('Simulated JWT Signing Failure'),
    );

    await expect(
      authService.verifyEmail({ phone: '0912345678', otp: '123456' }),
    ).rejects.toThrow('Simulated JWT Signing Failure');

    // Confirm DB transaction was never executed: OTP was not consumed, account not updated, session not created
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.otpChallenge.update).not.toHaveBeenCalled();
    expect(dbMock.account.update).not.toHaveBeenCalled();
    expect(dbMock.refreshSession.create).not.toHaveBeenCalled();
  });

  it('7. Atomicity: If token signing fails in login, session is NOT written to database', async () => {
    const rawPassword = 'Password123@';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const mockAccount = {
      id: 'acc-login-fail-1',
      userId: 'user-login-fail-1',
      phone: '+84912345678',
      email: 'user@example.com',
      passwordHash,
      emailVerifiedAt: new Date(),
      status: 'active',
      roles: [{ role: { name: 'Customer', permissionRoles: [] } }],
    };

    dbMock.account.findUnique.mockResolvedValue(mockAccount);

    // Simulate signing failure
    vi.spyOn((authService as any).tokenSigner, 'signAccessToken').mockRejectedValueOnce(
      new Error('Simulated JWT Signing Failure in Login'),
    );

    await expect(
      authService.login({ phone: '0912345678', password: rawPassword }),
    ).rejects.toThrow('Simulated JWT Signing Failure in Login');

    // Confirm no session was created in DB
    expect(dbMock.refreshSession.create).not.toHaveBeenCalled();
  });

  it('8. Atomicity: If token signing fails in refresh, refresh token is NOT rotated in database', async () => {
    const rawOldRefreshToken = 'old-plain-refresh-token';
    const hashed = (authService as any).tokenSigner.hashToken(rawOldRefreshToken);
    const mockAccount = {
      id: 'acc-refresh-fail-1',
      userId: 'user-refresh-fail-1',
      phone: '+84912345678',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      status: 'active',
      roles: [{ role: { name: 'Customer', permissionRoles: [] } }],
    };

    dbMock.refreshSession.findFirst.mockResolvedValue({
      id: 'sess-fail-1',
      refreshTokenHash: hashed,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      account: mockAccount,
    });
    dbMock.account.findUnique.mockResolvedValue(mockAccount);

    // Simulate signing failure
    vi.spyOn((authService as any).tokenSigner, 'signAccessToken').mockRejectedValueOnce(
      new Error('Simulated JWT Signing Failure in Refresh'),
    );

    await expect(
      authService.refresh({ refreshToken: rawOldRefreshToken }),
    ).rejects.toThrow('Simulated JWT Signing Failure in Refresh');

    // Confirm updateMany was NOT called to rotate the session
    expect(dbMock.refreshSession.updateMany).not.toHaveBeenCalled();
  });
});
