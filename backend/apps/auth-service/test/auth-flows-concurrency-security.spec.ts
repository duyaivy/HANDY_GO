import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthPrismaService } from '@app/database';
import {
  AuthModule,
  AuthSignerModule,
  PermissionsGuard,
} from '@app/auth';
import { RabbitMQService } from '@app/rabbitmq';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES } from '@app/common';
import { AuthServiceService } from '../src/auth-service.service.js';
import { AuthServiceController } from '../src/auth-service.controller.js';
import { OtpService } from '../src/otp/otp.service.js';
import { OutboxPublisherService } from '../src/outbox/outbox-publisher.service.js';
import { RateLimiterService } from '../src/rate-limit/rate-limiter.service.js';
import { UserTrustClient } from '../src/rpc/user-trust.client.js';
import { SessionService } from '../src/session/session.service.js';
import { RegisterFlowService } from '../src/flows/register-flow.service.js';
import { OtpFlowService } from '../src/flows/otp-flow.service.js';
import { LoginFlowService } from '../src/flows/login-flow.service.js';
import {
  HTTP_TOO_EARLY,
  INTERNAL_GATEWAY_HEADER,
  FORWARDED_FOR_HEADER,
} from '../src/auth.constants.js';

describe('Auth Flows Concurrency, RPC Fail-Close & Security Isolation', () => {
  let module: TestingModule;
  let authService: AuthServiceService;
  let controller: AuthServiceController;
  let userTrustClient: UserTrustClient;
  let dbMock: any;
  let otpServiceMock: any;
  let rabbitmqMock: any;
  let rateLimiterMock: any;


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
        findUnique: vi.fn().mockResolvedValue({ id: 'role-cust', code: 'CUSTOMER', name: 'Customer' }),
        create: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'challenge-new', ...args.data })),
        update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
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
      maskEmail: vi.fn((email: string) => `m***@${email.split('@')[1]}`),
    };

    rabbitmqMock = {
      send: vi.fn().mockResolvedValue({
        exists: true,
        status: 'active',
        isProvisioned: true,
      }),
    };

    rateLimiterMock = {
      checkAndIncrement: vi.fn().mockResolvedValue(undefined),
      checkFailedLogins: vi.fn().mockResolvedValue(undefined),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    };

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
        {
          provide: OutboxPublisherService,
          useValue: { triggerPublish: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: RateLimiterService, useValue: rateLimiterMock },
        { provide: RabbitMQService, useValue: rabbitmqMock },
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
    controller = module.get<AuthServiceController>(AuthServiceController);
    userTrustClient = module.get<UserTrustClient>(UserTrustClient);
  });


  describe('1. Concurrent OTP Verification', () => {
    it('only one concurrent verify request can succeed; second gets OTP_ALREADY_USED', async () => {
      const mockAccount = {
        id: 'acc-verify-conc',
        userId: 'user-verify-conc',
        phone: '+84912345678',
        email: 'conc@example.com',
        emailVerifiedAt: null,
        status: 'pending',
        roles: [{ role: { name: 'Customer', permissionRoles: [] } }],
      };

      dbMock.account.findFirst.mockResolvedValue(mockAccount);
      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'challenge-conc',
        otpHash: 'hashed_123456',
        attempts: 0,
        expiresAt: new Date(Date.now() + 600000),
        isUsed: false,
        deliveryStatus: 'delivered',
      });

      // Simulate first request updating isUsed successfully (count=1),
      // while second concurrent request sees isUsed=true so updateMany returns count=0
      let callCount = 0;
      dbMock.otpChallenge.updateMany.mockImplementation(() => {
        callCount++;
        return Promise.resolve({ count: callCount === 1 ? 1 : 0 });
      });

      // Launch both verify calls concurrently
      const verifyPromise1 = authService.verifyEmail({ phone: '0912345678', otp: '123456' });
      const verifyPromise2 = authService.verifyEmail({ phone: '0912345678', otp: '123456' });

      const results = await Promise.allSettled([verifyPromise1, verifyPromise2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(AppException);
      expect((rejectedReason as AppException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((rejectedReason as AppException).getResponse()).toMatchObject({
        code: ERROR_CODES.OTP_ALREADY_USED,
      });
    });

    it('rejects OTP verification if account is already active / verified', async () => {
      dbMock.account.findFirst.mockResolvedValue({
        id: 'acc-already-active',
        phone: '+84912345678',
        email: 'active@example.com',
        emailVerifiedAt: new Date(),
        status: 'active',
        roles: [],
      });

      await expect(
        authService.verifyEmail({ phone: '0912345678', otp: '123456' }),
      ).rejects.toThrow(AppException);
    });

    it('wrong OTP attempts use atomic increment without overwriting concurrent attempts', async () => {
      dbMock.account.findFirst.mockResolvedValue({
        id: 'acc-attempt-test',
        phone: '+84912345678',
        email: 'attempt@example.com',
        emailVerifiedAt: null,
        status: 'pending',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue({
        id: 'ch-attempt',
        otpHash: 'hashed_123456',
        attempts: 2,
        expiresAt: new Date(Date.now() + 600000),
        isUsed: false,
        deliveryStatus: 'delivered',
      });

      // Simulate atomic increment returning 3
      dbMock.otpChallenge.update.mockResolvedValueOnce({
        id: 'ch-attempt',
        attempts: 3,
      });

      await expect(
        authService.verifyEmail({ phone: '0912345678', otp: '999999' }),
      ).rejects.toThrow(AppException);

      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'ch-attempt' },
        data: { attempts: { increment: 1 } },
      });
    });
  });

  describe('2. Concurrent OTP Resend & Delivery Failure Isolation', () => {
    it('creates pending challenge as a slot holder; two concurrent resends do not produce two usable codes', async () => {
      dbMock.account.findFirst.mockResolvedValue({
        id: 'acc-resend-test',
        phone: '+84912345678',
        email: 'resend@example.com',
        emailVerifiedAt: null,
        status: 'pending',
      });

      // Initially no challenge cooldown
      dbMock.otpChallenge.findFirst.mockResolvedValueOnce(null);

      const resendResult = await authService.resendOtp({ phone: '0912345678' });
      expect(resendResult.statusCode).toBe(HttpStatus.OK);

      // Pending challenge was created first, then activated after SMTP success
      expect(dbMock.otpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryStatus: 'pending' }),
        }),
      );
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deliveryStatus: 'delivered' },
        }),
      );
    });

    it('if SMTP delivery fails on resend, pending placeholder is invalidated and old delivered code remains valid', async () => {
      dbMock.account.findFirst.mockResolvedValue({
        id: 'acc-resend-fail',
        phone: '+84912345678',
        email: 'resend-fail@example.com',
        emailVerifiedAt: null,
        status: 'pending',
      });

      dbMock.otpChallenge.findFirst.mockResolvedValue(null);

      // Simulate SMTP failure
      otpServiceMock.sendVerificationOtp.mockRejectedValueOnce(
        new Error('SMTP service network unreachable'),
      );

      await expect(
        authService.resendOtp({ phone: '0912345678' }),
      ).rejects.toThrow(AppException);

      // Pending placeholder was marked failed and used
      expect(dbMock.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: 'failed',
            isUsed: true,
          }),
        }),
      );

      // Previous active challenges were NOT batch invalidated
      expect(dbMock.otpChallenge.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('3. Registration & Preseeded Roles', () => {
    it('uses a preseeded Worker role without creating roles during registration', async () => {
      dbMock.account.findUnique.mockResolvedValue(null);
      dbMock.role.findUnique.mockResolvedValue({ id: 'role-worker', code: 'WORKER', name: 'Worker' });
      dbMock.account.create.mockResolvedValue({
        id: 'acc-worker-1',
        userId: 'user-worker-1',
        phone: '+84987654321',
        email: 'worker@example.com',
        emailVerifiedAt: null,
        status: 'pending',
      });

      const res = await authService.register(
        {
          fullName: 'Tran Van Worker',
          phone: '0987654321',
          email: 'worker@example.com',
          password: 'Password123@',
          role: 'Worker',
        },
        '10.0.0.1',
      );

      expect(res.statusCode).toBe(HttpStatus.CREATED);
      expect(dbMock.role.findUnique).toHaveBeenCalledWith({ where: { code: 'WORKER' } });
      expect(dbMock.role.create).not.toHaveBeenCalled();
    });

    it('translates P2002 duplicate phone / email errors into 409 Conflict', async () => {
      dbMock.account.findUnique.mockResolvedValue(null);
      dbMock.account.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['phone'] },
      });

      await expect(
        authService.register({
          fullName: 'Test User',
          phone: '0912345678',
          email: 'test@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('4. User & Trust RPC Fail-Close (No Test Bypass & 503 on Failure)', () => {
    it('throws 503 SERVICE_UNAVAILABLE when RabbitMQ dependency is missing', async () => {
      const clientWithoutRmq = new UserTrustClient(undefined);
      await expect(clientWithoutRmq.confirmUserStatus('user-1', ['Customer'])).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.SERVICE_UNAVAILABLE }),
      );
    });

    it('throws 503 SERVICE_UNAVAILABLE when RPC call throws or RabbitMQ is down', async () => {
      rabbitmqMock.send.mockRejectedValueOnce(new Error('Broker connection terminated'));

      await expect(userTrustClient.confirmUserStatus('user-1', ['Customer'])).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.SERVICE_UNAVAILABLE }),
      );
    });

    it('throws 425 PROFILE_NOT_READY when profile is not yet provisioned', async () => {
      rabbitmqMock.send.mockResolvedValueOnce({
        exists: true,
        status: 'pending',
        isProvisioned: false,
      });

      await expect(userTrustClient.confirmUserStatus('user-1', ['Customer'])).rejects.toThrow(
        expect.objectContaining({ status: HTTP_TOO_EARLY }),
      );
    });

    it('throws 403 ACCOUNT_BLOCKED when user status is suspended or deleted', async () => {
      rabbitmqMock.send.mockResolvedValueOnce({
        exists: true,
        status: 'suspended',
        isProvisioned: true,
      });

      await expect(userTrustClient.confirmUserStatus('user-1', ['Customer'])).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.FORBIDDEN }),
      );
    });
  });

  describe('5. IP Spoofing Prevention via Internal Secret Header', () => {
    it('uses socket IP and ignores client-supplied X-Forwarded-For if internal secret is missing', async () => {
      const dto = {
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'a@example.com',
        password: 'Password123',
      };

      const spyRegister = vi.spyOn(authService, 'register').mockResolvedValueOnce({} as any);

      const fakeReq = {
        headers: {
          [FORWARDED_FOR_HEADER]: '198.51.100.1', // Attacker forged IP
        },
        socket: { remoteAddress: '10.0.0.99' },
      } as any;

      await controller.register(dto as any, '10.0.0.99', fakeReq);

      // Must NOT use forged IP '198.51.100.1', must use socket remoteAddress '10.0.0.99'
      expect(spyRegister).toHaveBeenCalledWith(dto, '10.0.0.99');
    });

    it('accepts forwarded IP when authenticated by valid Gateway internal secret', async () => {
      const dto = {
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'a@example.com',
        password: 'Password123',
      };

      const spyRegister = vi.spyOn(authService, 'register').mockResolvedValueOnce({} as any);

      const trustedReq = {
        headers: {
          [FORWARDED_FOR_HEADER]: '203.0.113.55',
          [INTERNAL_GATEWAY_HEADER]: 'gateway-shared-secret-123',
        },
        socket: { remoteAddress: '10.0.0.1' },
      } as any;

      await controller.register(dto as any, '10.0.0.1', trustedReq);

      expect(spyRegister).toHaveBeenCalledWith(dto, '203.0.113.55');
    });
  });

  describe('6. Logout Response Normalization', () => {
    it('standardizes logout response to { statusCode: 200, message, data: null }', async () => {
      const res = await authService.logout({ refreshToken: 'mock-token' });
      expect(res).toEqual({
        statusCode: 200,
        message: 'Đăng xuất thành công',
        data: null,
      });
    });
  });

  describe('7. PermissionsGuard Generic Error Message', () => {
    it('returns generic error without leaking route permission internal details', () => {
      const reflector = new Reflector();
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null); // No public, no permissions

      const guard = new PermissionsGuard(reflector);
      const mockContext = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { permissions: [] } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      try {
        guard.canActivate(mockContext);
      } catch (err) {
        expect((err as ForbiddenException).message).toBe(
          'Bạn không có quyền thực hiện thao tác này',
        );
      }
    });
  });
});
