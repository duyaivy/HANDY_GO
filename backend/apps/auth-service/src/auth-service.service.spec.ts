import { Test, type TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthPrismaService } from '@app/database';
import { TokenSignerService } from '@app/auth';
import { RabbitMQService } from '@app/rabbitmq';
import { AuthServiceService } from './auth-service.service.js';
import { OtpService } from './otp/otp.service.js';
import { OutboxPublisherService } from './outbox/outbox-publisher.service.js';
import { RateLimiterService } from './rate-limit/rate-limiter.service.js';

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
      },
      role: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      refreshSession: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
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
      generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
      hashToken: vi.fn((token: string) => `hashed_${token}`),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthServiceService,
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: TokenSignerService, useValue: tokenSignerMock },
        { provide: OtpService, useValue: otpServiceMock },
        { provide: OutboxPublisherService, useValue: outboxPublisherMock },
        { provide: RateLimiterService, useValue: rateLimiterMock },
        { provide: RabbitMQService, useValue: rabbitmqMock },
      ],
    }).compile();

    service = module.get<AuthServiceService>(AuthServiceService);
  });

  describe('register', () => {
    it('should successfully register a customer, normalize phone, and emit outbox event', async () => {
      dbMock.account.findUnique.mockResolvedValue(null);
      dbMock.role.findUnique.mockResolvedValue({ id: 'role-customer', name: 'Customer' });
      dbMock.account.create.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        status: 'pending',
        isVerified: false,
      });

      const result: any = await service.register({
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'customer@example.com',
        password: 'Password123',
      });

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data.userId).toBe('acc-1');
      expect(result.data.phone).toBe('+84912345678');
      expect(dbMock.account.create).toHaveBeenCalled();
      expect(dbMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'user.registered',
            status: 'pending',
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
  });

  describe('verifyEmail (OTP verification)', () => {
    it('should activate account and auto-login when OTP is correct', async () => {
      const mockAccount = {
        id: 'acc-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        status: 'pending',
        isVerified: false,
        roles: [
          {
            role: {
              name: 'Customer',
              rolePermissions: [
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
      expect(dbMock.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isVerified: true, status: 'active' },
        }),
      );
    });

    it('should throw BadRequestException and increment attempts if OTP is incorrect', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', status: 'pending', isVerified: false });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        otpHash: 'hashed_123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 1,
        isUsed: false,
      });

      await expect(
        service.verifyEmail({
          email: 'customer@example.com',
          otp: '000000',
        }),
      ).rejects.toThrow(HttpException);

      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { attempts: 2 },
        }),
      );
    });

    it('should throw 429 Too Many Requests if attempts reach max', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', status: 'pending', isVerified: false });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        otpHash: 'hashed_123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 5,
        isUsed: false,
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
    it('should throw 429 if cooldown has not passed', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', email: 'c@example.com', status: 'pending', isVerified: false });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        resendAvailableAt: new Date(Date.now() + 30000), // 30s remaining
        isUsed: false,
      });

      await expect(
        service.resendOtp({ email: 'c@example.com' }),
      ).rejects.toThrow(HttpException);
    });

    it('should send new OTP after cooldown expires', async () => {
      dbMock.account.findFirst.mockResolvedValue({ id: 'acc-1', email: 'c@example.com', status: 'pending', isVerified: false });
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-1',
        resendAvailableAt: new Date(Date.now() - 5000), // cooldown expired
        isUsed: false,
      });

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
        phone: '+84912345678',
        email: 'customer@example.com',
        passwordHash,
        isVerified: true,
        status: 'active',
        roles: [
          {
            role: {
              name: 'Customer',
              rolePermissions: [{ permission: { code: 'profile:read' } }],
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

    it('should reject login if password does not match', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        passwordHash,
        isVerified: true,
        status: 'active',
        accountRoles: [],
      });

      await expect(
        service.login({
          phone: '0912345678',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should reject login with 403 Forbidden if account is pending / unverified', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        passwordHash,
        isVerified: false,
        status: 'pending',
        roles: [],
        otpChallenges: [
          {
            resendAvailableAt: new Date(Date.now() + 30000),
            expiresAt: new Date(Date.now() + 600000),
          },
        ],
      });

      await expect(
        service.login({
          phone: '0912345678',
          password: 'Password123',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should reject login with 403 Forbidden if account is suspended', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        phone: '+84912345678',
        passwordHash,
        isVerified: true,
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
        isVerified: true,
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
        absoluteExpiresAt: new Date(Date.now() + 86400000 * 5),
        isRevoked: false,
      });

      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

      dbMock.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        status: 'active',
        isVerified: true,
        roles: [
          {
            role: {
              name: 'Customer',
              rolePermissions: [{ permission: { code: 'profile:read' } }],
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

    it('should throw UnauthorizedException if session is expired or not found', async () => {
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'expired-token' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('logout', () => {
    it('should revoke session on logout', async () => {
      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

      const result: any = await service.logout(
        { refreshToken: 'mock-refresh-token' },
        {
          accountId: 'acc-1',
          userId: 'acc-1',
          sessionId: 'session-1',
          roles: ['Customer'],
          permissions: [],
        },
      );

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(dbMock.refreshSession.updateMany).toHaveBeenCalled();
    });
  });
});
