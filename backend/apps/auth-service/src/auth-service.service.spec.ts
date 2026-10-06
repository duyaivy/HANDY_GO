import { Test, type TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthPrismaService } from '@app/database';
import { TokenSignerService } from '@app/auth';
import { RabbitMQService } from '@app/rabbitmq';
import { ConfigService } from '@app/config';
import { AuthServiceService } from './auth-service.service.js';
import { OtpService } from './otp/otp.service.js';
import { OutboxPublisherService } from '@app/common';
import { RateLimiterService } from './common/rate-limit/rate-limiter.service.js';
import { LoginLockoutService } from './common/security/login-lockout.service.js';
import { RegisterFlowService } from './register/register-flow.service.js';
import { OtpFlowService } from './otp/otp-flow.service.js';
import { LoginFlowService } from './login/login-flow.service.js';
import { SessionService } from './common/session/session.service.js';
import { UserTrustClient } from './common/rpc/user-trust.client.js';

describe('AuthServiceService', () => {
  let service: AuthServiceService;
  let dbMock: any;
  let tokenSignerMock: any;
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
        findUnique: vi.fn().mockResolvedValue({ id: 'role-customer', code: 'CUSTOMER', name: 'Customer' }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'role-customer', code: 'CUSTOMER', name: 'Customer' },
          { id: 'role-worker', code: 'WORKER', name: 'Worker' },
        ]),
        create: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'challenge-new', ...args.data })),
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

    tokenSignerMock = {
      signAccessToken: vi.fn().mockResolvedValue({
        token: 'mock-access-token',
        expiresIn: 300,
        jti: 'mock-jti',
      }),
      signRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
      generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
      hashToken: vi.fn((token: string) => `hashed_${token}`),
    };

    otpServiceMock = {
      maxAttempts: 5,
      expirationMinutes: 10,
      resendCooldownSeconds: 60,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthServiceService,
        RegisterFlowService,
        OtpFlowService,
        LoginFlowService,
        SessionService,
        UserTrustClient,
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: TokenSignerService, useValue: tokenSignerMock },
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

    service = module.get<AuthServiceService>(AuthServiceService);
  });

  describe('register', () => {
    it('should successfully register an account with Customer and Worker roles, normalize phone, and emit outbox event v3', async () => {
      dbMock.account.findUnique.mockResolvedValue(null);
      dbMock.role.findMany.mockResolvedValue([
        { id: 'role-customer', code: 'CUSTOMER', name: 'Customer' },
        { id: 'role-worker', code: 'WORKER', name: 'Worker' },
      ]);
      dbMock.account.create.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        status: 'pending',
        emailVerifiedAt: null,
      });

      const result: any = await service.register({
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'customer@example.com',
        password: 'Password123',
      });

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data.userId).toBe('user-1');
      expect(result.data.phone).toBe('+84912345678');
      expect(dbMock.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.any(String),
          userId: expect.any(String),
          status: 'pending',
          roles: {
            create: [
              { roleId: 'role-customer', assignedAt: expect.any(Date) },
              { roleId: 'role-worker', assignedAt: expect.any(Date) },
            ],
          },
        }),
      });
      const createdAccount = dbMock.account.create.mock.calls[0][0].data;
      expect(createdAccount.id).not.toBe(createdAccount.userId);
      expect(dbMock.role.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['CUSTOMER', 'WORKER'] } },
      });
      expect(dbMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'user.registered',
            eventVersion: 3,
            status: 'pending',
            payload: expect.objectContaining({
              eventVersion: 3,
              data: expect.objectContaining({
                accountId: 'acc-1',
                userId: 'user-1',
                roles: ['Customer', 'Worker'],
              }),
            }),
          }),
        }),
      );
    });

    it('should throw ConflictException if phone is already registered', async () => {
      dbMock.account.findUnique.mockResolvedValueOnce({ id: 'existing-acc' });

      await expect(
        service.register({
          fullName: 'Nguyen Van A',
          phone: '0912345678',
          email: 'new@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw ConflictException if email is already registered', async () => {
      dbMock.account.findUnique
        .mockResolvedValueOnce(null) // phone check
        .mockResolvedValueOnce({ id: 'existing-acc' }); // email check

      await expect(
        service.register({
          fullName: 'Nguyen Van A',
          phone: '0912345678',
          email: 'existing@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BadRequestException if phone format is invalid', async () => {
      await expect(
        service.register({
          fullName: 'Nguyen Van A',
          phone: '12345',
          email: 'test@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should handle SMTP failure during registration by keeping pending account and returning immediate resend without cooldown', async () => {
      dbMock.account.findUnique.mockResolvedValue(null);
      dbMock.account.create.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
        phone: '+84912345678',
        email: 'smtp-fail@example.com',
        status: 'pending',
        emailVerifiedAt: null,
      });
      otpServiceMock.sendVerificationOtp.mockRejectedValueOnce(new Error('SMTP down'));

      try {
        await service.register({
          fullName: 'Nguyen Van A',
          phone: '0912345678',
          email: 'smtp-fail@example.com',
          password: 'Password123',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
        const res = err.getResponse();
        expect(res.details.verification.challengeId).toBeDefined();
        expect(res.details.verification.resendAvailableAt).toBeDefined();
        expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              deliveryStatus: 'failed',
              deliveryError: 'SMTP down',
              resendAvailableAt: expect.any(Date),
            }),
          }),
        );
      }
    });
  });

  describe('verifyEmail (OTP verification)', () => {
    it.each(['suspended', 'locked', 'deleted'])(
      'rejects OTP verification for %s accounts',
      async (status) => {
        dbMock.account.findFirst.mockResolvedValue({
          id: 'acc-blocked',
          status,
          emailVerifiedAt: null,
        });

        await expect(
          service.verifyEmail({ email: 'blocked@example.com', otp: '123456' }),
        ).rejects.toThrow(HttpException);
        expect(dbMock.otpChallenge.findFirst).not.toHaveBeenCalled();
      },
    );

    it('should activate account and auto-login when OTP is correct', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        status: 'pending',
        emailVerifiedAt: null,
        roles: [
          {
            role: {
              name: 'Customer',
              permissionRoles: [
                { permission: { code: 'profile:read' } },
                { permission: { code: 'auth:me' } },
              ],
            },
          },
        ],
      };
      dbMock.account.findFirst.mockResolvedValue(mockAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        otpHash: 'hashed_123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
        isUsed: false,
        deliveryStatus: 'delivered',
      });
      dbMock.refreshSession.create.mockResolvedValue({ id: 'session-1' });

      const result: any = await service.verifyEmail({
        email: 'customer@example.com',
        otp: '123456',
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.accessToken).toBe('mock-access-token');
      expect(result.data.user.roles).toContain('Customer');
      expect(result.data.user.permissions).toContain('profile:read');
      expect(dbMock.account.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'acc-1', status: 'pending' }),
          data: expect.objectContaining({
            emailVerifiedAt: expect.any(Date),
            status: 'active',
            updatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw BadRequestException and increment attempts if OTP is incorrect', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', status: 'pending', emailVerifiedAt: null });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        otpHash: 'hashed_123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 1,
        isUsed: false,
        deliveryStatus: 'delivered',
      });
      dbMock.otpChallenge.update.mockResolvedValue({
        id: 'challenge-1',
        attempts: 2,
      });

      await expect(
        service.verifyEmail({
          email: 'customer@example.com',
          otp: '000000',
        }),
      ).rejects.toThrow(HttpException);

      expect(dbMock.otpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'challenge-1',
            isUsed: false,
            deliveryStatus: 'delivered',
            attempts: { lt: 5 },
          }),
          data: { attempts: { increment: 1 } },
        }),
      );
    });

    it('should throw 429 Too Many Requests if attempts reach max', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', status: 'pending', emailVerifiedAt: null });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        otpHash: 'hashed_123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 5,
        isUsed: false,
        deliveryStatus: 'delivered',
      });

      await expect(
        service.verifyEmail({
          email: 'customer@example.com',
          otp: '123456',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('resendOtp', () => {
    it.each(['suspended', 'locked', 'deleted'])(
      'rejects OTP resend for %s accounts',
      async (status) => {
        dbMock.account.findFirst.mockResolvedValue({
          id: 'acc-blocked',
          email: 'blocked@example.com',
          status,
          emailVerifiedAt: null,
        });

        await expect(
          service.resendOtp({ email: 'blocked@example.com' }),
        ).rejects.toThrow(HttpException);
        expect(otpServiceMock.sendVerificationOtp).not.toHaveBeenCalled();
      },
    );

    it('should throw 429 if cooldown has not passed', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', email: 'c@example.com', status: 'pending', emailVerifiedAt: null });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        resendAvailableAt: new Date(Date.now() + 30000), // 30s remaining
        isUsed: false,
        deliveryStatus: 'delivered',
      });

      await expect(
        service.resendOtp({ email: 'c@example.com' }),
      ).rejects.toThrow(HttpException);
    });

    it('should send new OTP after cooldown expires', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', email: 'c@example.com', status: 'pending', emailVerifiedAt: null });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        resendAvailableAt: new Date(Date.now() - 5000), // cooldown expired
        isUsed: false,
        deliveryStatus: 'delivered',
      });

      const result: any = await service.resendOtp({ email: 'c@example.com' });
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(otpServiceMock.sendVerificationOtp).toHaveBeenCalled();
    });

    it('should allow immediate resend if previous challenge delivery failed without applying cooldown', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', email: 'c@example.com', status: 'pending', emailVerifiedAt: null });
      // Previous challenge failed delivery; findFirst filtering for delivered returns null
      dbMock.otpChallenge.findFirst.mockResolvedValue(null);

      const result: any = await service.resendOtp({ email: 'c@example.com' });
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(otpServiceMock.sendVerificationOtp).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should successfully log in active verified user and return tokens', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        passwordHash,
        emailVerifiedAt: new Date(),
        status: 'active',
        roles: [
          {
            role: {
              name: 'Customer',
              permissionRoles: [{ permission: { code: 'profile:read' } }],
            },
          },
        ],
      };
      dbMock.account.findUnique.mockResolvedValue(mockAccount);
      dbMock.refreshSession.create.mockResolvedValue({ id: 'session-1' });

      const result: any = await service.login({
        phone: '0912345678',
        password: 'Password123',
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.accessToken).toBe('mock-access-token');
      expect(result.data.user.roles).toEqual(['Customer']);
    });

    it('logs in a verified Worker draft using the separate User & Trust userId', async () => {
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-worker',
        userId: 'user-worker',
        phone: '+84912345678',
        email: 'worker@example.com',
        passwordHash: await bcrypt.hash('Password123', 10),
        emailVerifiedAt: new Date(),
        status: 'active',
        roles: [{ role: { name: 'Worker', permissionRoles: [] } }],
        otpChallenges: [],
      });

      const result = await service.login({
        phone: '0912345678',
        password: 'Password123',
      });

      expect(result.data.user.id).toBe('user-worker');
      expect(result.data.user.roles).toEqual(['Worker']);
      expect(rabbitmqMock.send).toHaveBeenCalledWith('user.auth-status', {
        userId: 'user-worker',
        roles: ['Worker'],
      });
      expect(tokenSignerMock.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acc-worker', userId: 'user-worker' }),
      );
    });

    it('should reject login if password does not match with 422 Unprocessable Entity', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
        phone: '+84912345678',
        passwordHash,
        emailVerifiedAt: new Date(),
        status: 'active',
        roles: [],
      });

      await expect(
        service.login({
          phone: '0912345678',
          password: 'WrongPassword',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    });

    it('should reject login with 403 Forbidden if account is pending and return challengeId', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        email: 'pending@example.com',
        passwordHash,
        emailVerifiedAt: null,
        status: 'pending',
        roles: [],
        otpChallenges: [
          {
            id: 'challenge-pending-456',
            resendAvailableAt: new Date(Date.now() + 30000),
            expiresAt: new Date(Date.now() + 600000),
            deliveryStatus: 'delivered',
          },
        ],
      });

      try {
        await service.login({
          phone: '0912345678',
          password: 'Password123',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
        const res = err.getResponse();
        expect(res.details.verification.challengeId).toBe('challenge-pending-456');
        expect(res.details.verification.phone).toBe('+84912345678');
      }
    });

    it('should reject login with 403 Forbidden if account is suspended', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        passwordHash,
        emailVerifiedAt: new Date(),
        status: 'suspended',
        roles: [],
      });

      await expect(
        service.login({
          phone: '0912345678',
          password: 'Password123',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should reject login with 403 Forbidden if account is deleted or not active', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        passwordHash,
        emailVerifiedAt: new Date(),
        status: 'deleted',
        roles: [],
      });

      await expect(
        service.login({
          phone: '0912345678',
          password: 'Password123',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('refresh', () => {
    it('should rotate refresh token and issue new access token', async () => {
      dbMock.refreshSession.findFirst.mockResolvedValue({
        id: 'session-1',
        accountId: 'acc-1',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(Date.now() - 86400000 * 2),
        isRevoked: false,
      });

      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
        status: 'active',
        emailVerifiedAt: new Date(),
        roles: [
          {
            role: {
              name: 'Customer',
              permissionRoles: [{ permission: { code: 'profile:read' } }],
            },
          },
        ],
      });

      const result: any = await service.refresh({
        refreshToken: 'valid-token',
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.accessToken).toBe('mock-access-token');
      expect(dbMock.refreshSession.updateMany).toHaveBeenCalled();
    });

    it('rejects refresh after the seven-day absolute lifetime derived from createdAt', async () => {
      dbMock.refreshSession.findFirst.mockResolvedValue({
        id: 'session-expired',
        accountId: 'acc-1',
        createdAt: new Date(Date.now() - 8 * 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      await expect(service.refresh({ refreshToken: 'old-token' })).rejects.toThrow(HttpException);
      expect(dbMock.refreshSession.update).toHaveBeenCalledWith({
        where: { id: 'session-expired' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(tokenSignerMock.signAccessToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if session is expired or not found', async () => {
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'expired-token' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('logout', () => {
    it('should revoke session on logout and return data: null', async () => {
      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

      const result: any = await service.logout({ refreshToken: 'mock-refresh-token' });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.message).toBe('Đăng xuất thành công');
      expect(result.data).toBeNull();
      expect(dbMock.refreshSession.updateMany).toHaveBeenCalled();
    });
  });
});
