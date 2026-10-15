import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { of } from 'rxjs';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { AuthModule, AuthSignerModule } from '@app/auth';
import { AuthPrismaService } from '@app/database';
import { RabbitMQService } from '@app/rabbitmq';
import { ConfigService } from '@app/config';
import { OutboxPublisherService } from '@app/common';
import { RegisterFlowService } from '../src/register/register-flow.service.js';
import { PasswordResetFlowService } from '../src/otp/password-reset-flow.service.js';
import { LoginFlowService } from '../src/login/login-flow.service.js';
import { SessionService } from '../src/common/session/session.service.js';
import { RateLimiterService } from '../src/common/rate-limit/rate-limiter.service.js';
import { LoginLockoutService } from '../src/common/security/login-lockout.service.js';
import { UserTrustClient } from '../src/common/rpc/user-trust.client.js';
import { OtpService } from '../src/otp/otp.service.js';

describe('Password Reset Concurrency & Integration with Isolated Test Database', () => {
  let module: TestingModule;
  let flowService: PasswordResetFlowService;
  let prisma: AuthPrismaService;
  let otpServiceMock: {
    generateOtp: ReturnType<typeof vi.fn>;
    verifyOtpHash: ReturnType<typeof vi.fn>;
    sendPasswordResetOtp: ReturnType<typeof vi.fn>;
    maskEmail: ReturnType<typeof vi.fn>;
    hashEmail: ReturnType<typeof vi.fn>;
  };

  const createdAccountIds: string[] = [];
  let isTestDbAvailable = false;

  beforeAll(async () => {
    // Chỉ kết nối nếu có cấu hình TEST_DATABASE_URL riêng biệt; không dùng dev database có dữ liệu
    const testDbUrl = process.env.TEST_DATABASE_URL_AUTH || process.env.TEST_DATABASE_URL;

    if (!testDbUrl) {
      isTestDbAvailable = false;
      return;
    }

    process.env.DATABASE_URL_AUTH = testDbUrl;

    otpServiceMock = {
      generateOtp: vi.fn(),
      verifyOtpHash: vi.fn((plain: string, hash: string) => hash === `hash_${plain}`),
      sendPasswordResetOtp: vi.fn().mockResolvedValue(undefined),
      maskEmail: vi.fn((email: string) => `m***@${email.split('@')[1]}`),
      hashEmail: vi.fn((email: string) => `hmac_${email}`),
    };

    module = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
      providers: [
        RegisterFlowService,
        PasswordResetFlowService,
        LoginFlowService,
        SessionService,
        UserTrustClient,
        AuthPrismaService,
        { provide: OtpService, useValue: otpServiceMock },
        { provide: OutboxPublisherService, useValue: { triggerPublish: vi.fn().mockResolvedValue(undefined) } },
        { provide: RateLimiterService, useValue: { checkAndIncrement: vi.fn().mockResolvedValue(undefined) } },
        {
          provide: LoginLockoutService,
          useValue: {
            checkAccountLocked: vi.fn().mockResolvedValue(undefined),
            recordFailedAttempt: vi.fn().mockResolvedValue(undefined),
            resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: RabbitMQService, useValue: { send: vi.fn().mockResolvedValue({ exists: true, status: 'active', isProvisioned: true }) } },
        { provide: 'USER_TRUST_RPC_CLIENT', useValue: { send: vi.fn().mockReturnValue(of({ exists: true, status: 'active', isProvisioned: true })) } },
        {
          provide: ConfigService,
          useValue: {
            internalServiceSecret: 'gateway-shared-secret-123',
            otpSecret: 'otp-secret-key-12345678901234567890',
          },
        },
      ],
    }).compile();

    flowService = module.get<PasswordResetFlowService>(PasswordResetFlowService);
    prisma = module.get<AuthPrismaService>(AuthPrismaService);

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isTestDbAvailable = true;
    } catch (err) {
      isTestDbAvailable = false;
      console.warn('Dedicated test PostgreSQL database is not reachable:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (!isTestDbAvailable) {
      await module?.close();
      return;
    }
    if (createdAccountIds.length > 0) {
      await prisma.passwordResetGrant.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
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

  it('1. Chạy trên test database riêng: kiểm tra race condition khi reset password đồng thời', async (ctx) => {
    if (!isTestDbAvailable) {
      ctx.skip();
      return;
    }

    const testAccountId = crypto.randomUUID();
    const testUserId = crypto.randomUUID();
    createdAccountIds.push(testAccountId);

    const initialPassword = 'InitialPassword@123';
    const initialHash = await bcrypt.hash(initialPassword, 10);

    await prisma.account.create({
      data: {
        id: testAccountId,
        userId: testUserId,
        email: `reset-test-${Date.now()}@example.com`,
        phone: `+84988${Date.now().toString().slice(-6)}`,
        passwordHash: initialHash,
        status: 'active',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Tạo grant reset
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');

    const grant = await prisma.passwordResetGrant.create({
      data: {
        accountId: testAccountId,
        tokenHash,
        expiresAt: new Date(Date.now() + 900000),
        isUsed: false,
      },
    });

    // Gửi đồng thời hai yêu cầu đổi mật khẩu với cùng grant
    const resetPromise1 = flowService.resetPassword({
      resetToken: rawResetToken,
      newPassword: 'NewPasswordOne@123',
    });
    const resetPromise2 = flowService.resetPassword({
      resetToken: rawResetToken,
      newPassword: 'NewPasswordTwo@123',
    });

    const results = await Promise.allSettled([resetPromise1, resetPromise2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Xác nhận grant trong DB đã được đánh dấu isUsed = true
    const updatedGrant = await prisma.passwordResetGrant.findUnique({
      where: { id: grant.id },
    });
    expect(updatedGrant?.isUsed).toBe(true);
    expect(updatedGrant?.usedAt).toBeDefined();

    // Xác nhận mật khẩu trong DB đã thay đổi
    const updatedAccount = await prisma.account.findUnique({
      where: { id: testAccountId },
    });
    expect(updatedAccount?.passwordChangedAt).toBeDefined();
    expect(updatedAccount?.passwordHash).not.toBe(initialHash);
  });
});
