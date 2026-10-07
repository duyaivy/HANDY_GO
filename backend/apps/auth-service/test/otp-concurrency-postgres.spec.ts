import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthModule, AuthSignerModule } from '@app/auth';
import { AuthPrismaService } from '@app/database';
import { RabbitMQService } from '@app/rabbitmq';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, OutboxPublisherService } from '@app/common';
import { AuthServiceService } from '../src/auth-service.service.js';
import { RegisterFlowService } from '../src/register/register-flow.service.js';
import { OtpFlowService } from '../src/otp/otp-flow.service.js';
import { LoginFlowService } from '../src/login/login-flow.service.js';
import { SessionService } from '../src/common/session/session.service.js';
import { RateLimiterService } from '../src/common/rate-limit/rate-limiter.service.js';
import { LoginLockoutService } from '../src/common/security/login-lockout.service.js';
import { UserTrustClient } from '../src/common/rpc/user-trust.client.js';
import { OtpService } from '../src/otp/otp.service.js';

describe('OTP Real Concurrency & Failure Resilience with PostgreSQL', () => {
  let module: TestingModule;
  let authService: AuthServiceService;
  let prisma: AuthPrismaService;
  let otpServiceMock: {
    generateOtp: ReturnType<typeof vi.fn>;
    verifyOtpHash: ReturnType<typeof vi.fn>;
    sendVerificationOtp: ReturnType<typeof vi.fn>;
    maskEmail: ReturnType<typeof vi.fn>;
  };

  const createdAccountIds: string[] = [];
  let isPostgresAvailable = false;

  beforeAll(async () => {
    // Ensure we connect to the configured or local PostgreSQL auth database
    process.env.DATABASE_URL_AUTH =
      process.env.DATABASE_URL_AUTH ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/handy_auth';

    otpServiceMock = {
      generateOtp: vi.fn(),
      verifyOtpHash: vi.fn(),
      sendVerificationOtp: vi.fn().mockResolvedValue(undefined),
      maskEmail: vi.fn((email: string) => `m***@${email.split('@')[1]}`),
    };

    module = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
      providers: [
        AuthServiceService,
        RegisterFlowService,
        OtpFlowService,
        LoginFlowService,
        SessionService,
        UserTrustClient,
        AuthPrismaService,
        { provide: OtpService, useValue: otpServiceMock },
        {
          provide: OutboxPublisherService,
          useValue: { triggerPublish: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: RateLimiterService,
          useValue: {
            checkAndIncrement: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoginLockoutService,
          useValue: {
            checkAccountLocked: vi.fn().mockResolvedValue(undefined),
            recordFailedAttempt: vi.fn().mockResolvedValue(undefined),
            resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RabbitMQService,
          useValue: { send: vi.fn().mockResolvedValue({ exists: true, status: 'active', isProvisioned: true }) },
        },
        {
          provide: ConfigService,
          useValue: {
            internalServiceSecret: 'gateway-shared-secret-123',
            otpSecret: 'otp-secret-key-12345678901234567890',
          },
        },
      ],
    }).compile();

    authService = module.get<AuthServiceService>(AuthServiceService);
    prisma = module.get<AuthPrismaService>(AuthPrismaService);
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.account.findFirst();
      isPostgresAvailable = true;
    } catch (err) {
      isPostgresAvailable = false;
      console.warn('PostgreSQL is not reachable or tables do not exist:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (!isPostgresAvailable) {
      await module?.close();
      return;
    }
    if (createdAccountIds.length > 0) {
      await prisma.otpChallenge.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.refreshSession.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.accountRole.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.account.deleteMany({
        where: { id: { in: createdAccountIds } },
      });
    }
    await prisma.$disconnect();
    await module.close();
  });

  it('1. Real concurrent OTP verification: multiple wrong attempts + correct attempt never exceed max attempts', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }
    const ts = Date.now().toString().slice(-6);
    const phone = `+84933${ts}`;
    const email = `conc.test.${ts}@test.local`;

    // Setup OTP generator for this test
    const correctCode = '112233';
    const otpHash = `hash_${correctCode}`;
    otpServiceMock.generateOtp.mockReturnValue({
      code: correctCode,
      hash: otpHash,
      expiresAt: new Date(Date.now() + 600000),
      resendAvailableAt: new Date(Date.now() + 60000),
    });
    otpServiceMock.verifyOtpHash.mockImplementation((plain: string, hash: string) => hash === `hash_${plain}`);

    // Register user through real DB
    const regRes = await authService.register(
      {
        fullName: `Test Concurrency ${ts}`,
        phone: phone.replace('+84', '0'),
        email,
        password: 'Password123@#$',
      },
      '127.0.0.1',
    );
    const challengeId = (regRes.data as any).challengeId;
    const account = await prisma.account.findUniqueOrThrow({ where: { phone } });
    createdAccountIds.push(account.id);

    // Concurrently fire 4 wrong attempts + 1 correct attempt
    const promises = [
      authService.verifyEmail({ email, otp: '000001', challengeId }),
      authService.verifyEmail({ email, otp: '000002', challengeId }),
      authService.verifyEmail({ email, otp: '000003', challengeId }),
      authService.verifyEmail({ email, otp: '000004', challengeId }),
      authService.verifyEmail({ email, otp: correctCode, challengeId }),
    ];

    const results = await Promise.allSettled(promises);

    // Check challenge state in PostgreSQL
    const challengeInDb = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challengeId },
    });

    // Total attempts must NEVER exceed 5
    expect(challengeInDb.attempts).toBeLessThanOrEqual(5);

    // If correct OTP succeeded, account must be active and challenge is used
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    if (fulfilled.length === 1) {
      expect(challengeInDb.isUsed).toBe(true);
      const updatedAcc = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(updatedAcc.status).toBe('active');
    } else {
      // If wrong attempts raced ahead and locked out, fulfilled is 0 and 429 was thrown for attempts exceeded
      expect(fulfilled.length).toBe(0);
      expect(challengeInDb.attempts).toBe(5);
    }
  });

  it('2. Two concurrent resend requests: only one succeeds and sends email, second receives 429', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }
    const ts = (Date.now() + 10).toString().slice(-6);
    const phone = `+84944${ts}`;
    const email = `resend.test.${ts}@test.local`;

    otpServiceMock.generateOtp.mockReturnValue({
      code: '654321',
      hash: 'hash_654321',
      expiresAt: new Date(Date.now() + 600000),
      resendAvailableAt: new Date(Date.now() + 60000),
    });

    // Simulate slight delay during SMTP dispatch so second request hits while pending
    otpServiceMock.sendVerificationOtp.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const _regRes = await authService.register(
      {
        fullName: `Test Resend ${ts}`,
        phone: phone.replace('+84', '0'),
        email,
        password: 'Password123@#$',
      },
      '127.0.0.1',
    );
    const account = await prisma.account.findUniqueOrThrow({ where: { phone } });
    createdAccountIds.push(account.id);

    // Clear resendAvailableAt on initial challenge so resend is immediately eligible
    await prisma.otpChallenge.updateMany({
      where: { accountId: account.id },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });

    otpServiceMock.sendVerificationOtp.mockClear();

    // Fire 2 concurrent resends for the same account
    const resendPromise1 = authService.resendOtp({ email });
    const resendPromise2 = authService.resendOtp({ email });

    const results = await Promise.allSettled([resendPromise1, resendPromise2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one resend must succeed and one must be rejected with 429
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as AppException).getResponse()).toMatchObject({
      code: ERROR_CODES.RATE_LIMITED,
    });

    // Exactly one email sent
    expect(otpServiceMock.sendVerificationOtp).toHaveBeenCalledTimes(1);

    // Only one delivered, unused challenge exists
    const validChallenges = await prisma.otpChallenge.findMany({
      where: {
        accountId: account.id,
        isUsed: false,
        deliveryStatus: 'delivered',
      },
    });
    expect(validChallenges).toHaveLength(1);
  });

  it('3. SMTP failure on resend preserves old code as usable and allows immediate retry', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }
    const ts = (Date.now() + 20).toString().slice(-6);
    const phone = `+84955${ts}`;
    const email = `smtpfail.test.${ts}@test.local`;

    const initialCode = '778899';
    otpServiceMock.generateOtp.mockReturnValue({
      code: initialCode,
      hash: `hash_${initialCode}`,
      expiresAt: new Date(Date.now() + 600000),
      resendAvailableAt: new Date(Date.now() + 60000),
    });
    otpServiceMock.verifyOtpHash.mockImplementation((plain: string, hash: string) => hash === `hash_${plain}`);

    const regRes = await authService.register(
      {
        fullName: `Test SMTP Fail ${ts}`,
        phone: phone.replace('+84', '0'),
        email,
        password: 'Password123@#$',
      },
      '127.0.0.1',
    );
    const initialChallengeId = (regRes.data as any).challengeId;
    const account = await prisma.account.findUniqueOrThrow({ where: { phone } });
    createdAccountIds.push(account.id);

    // Make resend immediately eligible
    await prisma.otpChallenge.updateMany({
      where: { accountId: account.id },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });

    // Next resend triggers SMTP failure
    otpServiceMock.sendVerificationOtp.mockRejectedValueOnce(new Error('SMTP connection timed out'));
    otpServiceMock.generateOtp.mockReturnValueOnce({
      code: '990011',
      hash: 'hash_990011',
      expiresAt: new Date(Date.now() + 600000),
      resendAvailableAt: new Date(Date.now() + 60000),
    });

    await expect(authService.resendOtp({ email })).rejects.toThrow(AppException);

    // Verify the failed challenge was marked failed
    const failedChallenge = await prisma.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        deliveryStatus: 'failed',
      },
    });
    expect(failedChallenge).toBeTruthy();
    expect(failedChallenge?.isUsed).toBe(true);

    // The OLD challenge is STILL usable (delivered and not used)
    const oldChallenge = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: initialChallengeId },
    });
    expect(oldChallenge.isUsed).toBe(false);
    expect(oldChallenge.deliveryStatus).toBe('delivered');

    // User can still verify with the old code!
    const verifyOldRes = await authService.verifyEmail({
      email,
      otp: initialCode,
      challengeId: initialChallengeId,
    });
    expect(verifyOldRes.statusCode).toBe(HttpStatus.OK);

    const verifiedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(verifiedAccount.status).toBe('active');
  });
});
