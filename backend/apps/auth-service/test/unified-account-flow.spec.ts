import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthModule,
  AuthSignerModule,
  RegisterRole,
  Role,
  TokenVerifierService,
} from '@app/auth';
import { AuthPrismaService, UserTrustPrismaService } from '@app/database';
import { RabbitMQService } from '@app/rabbitmq';
import { OutboxPublisherService, type DomainEvent } from '@app/common';
import { ConfigService } from '@app/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthServiceService } from '../src/auth-service.service.js';
import { RegisterFlowService } from '../src/register/register-flow.service.js';
import { OtpFlowService } from '../src/otp/otp-flow.service.js';
import { LoginFlowService } from '../src/login/login-flow.service.js';
import { SessionService } from '../src/common/session/session.service.js';
import { UserTrustClient } from '../src/common/rpc/user-trust.client.js';
import { OtpService } from '../src/otp/otp.service.js';
import { RateLimiterService } from '../src/common/rate-limit/rate-limiter.service.js';
import {
  UserTrustServiceService,
  type UserRegisteredData,
} from '../../user-trust-service/src/user-trust-service.service.js';

describe('Unified Account Full Lifecycle Flow (Customer & Worker in Single Account)', () => {
  let authService: AuthServiceService;
  let userTrustService: UserTrustServiceService;
  let verifier: TokenVerifierService;

  let authDbMock: any;
  let userTrustDbMock: any;
  let otpServiceMock: any;
  let rabbitmqMock: any;

  // In-memory simulation state for User & Trust DB
  const userTrustState = {
    users: new Map<string, any>(),
    customerProfiles: new Map<string, any>(),
    workerProfiles: new Map<string, any>(),
    eventInbox: new Map<string, any>(),
    kycCases: new Map<string, any>(),
  };

  beforeEach(async () => {
    userTrustState.users.clear();
    userTrustState.customerProfiles.clear();
    userTrustState.workerProfiles.clear();
    userTrustState.eventInbox.clear();
    userTrustState.kycCases.clear();

    const preseededRoles = [
      { id: 'role-cust-id', code: Role.CUSTOMER.toUpperCase(), name: Role.CUSTOMER },
      { id: 'role-work-id', code: Role.WORKER.toUpperCase(), name: Role.WORKER },
    ];

    authDbMock = {
      account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      role: {
        findMany: vi.fn().mockResolvedValue(preseededRoles),
        findUnique: vi.fn(),
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
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.data.id, ...args.data })),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(authDbMock)),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };

    userTrustDbMock = {
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          const user = userTrustState.users.get(where.id);
          if (!user) return null;
          return {
            ...user,
            customerProfile: userTrustState.customerProfiles.get(user.id) || null,
            workerProfile: userTrustState.workerProfiles.get(user.id) || null,
          };
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          userTrustState.users.set(data.id, { ...data });
          return { ...data };
        }),
      },
      customerProfile: {
        upsert: vi.fn().mockImplementation(async ({ where, create }) => {
          let prof = userTrustState.customerProfiles.get(where.userId);
          if (!prof) {
            prof = { ...create };
            userTrustState.customerProfiles.set(where.userId, prof);
          }
          return prof;
        }),
      },
      workerProfile: {
        upsert: vi.fn().mockImplementation(async ({ where, create }) => {
          let prof = userTrustState.workerProfiles.get(where.userId);
          if (!prof) {
            prof = { ...create };
            userTrustState.workerProfiles.set(where.userId, prof);
          }
          return prof;
        }),
      },
      eventInbox: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          return userTrustState.eventInbox.get(where.id) || null;
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          userTrustState.eventInbox.set(data.id, { ...data });
          return { ...data };
        }),
      },
      kycCase: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          userTrustState.kycCases.set(data.id, { ...data });
          return { ...data };
        }),
      },
      $transaction: vi.fn(async (cb) => cb(userTrustDbMock)),
    };

    otpServiceMock = {
      generateOtp: vi.fn().mockReturnValue({
        code: '123456',
        hash: 'mock_otp_hash_123456',
        expiresAt: new Date(Date.now() + 600000),
        resendAvailableAt: new Date(Date.now() + 60000),
      }),
      verifyOtpHash: vi.fn((plain: string, hash: string) => hash === 'mock_otp_hash_123456' && plain === '123456'),
      sendVerificationOtp: vi.fn().mockResolvedValue(undefined),
      maskEmail: vi.fn((email: string) => {
        const [local, domain] = email.split('@');
        return `${local[0]}***@${domain}`;
      }),
    };

    rabbitmqMock = {
      send: vi.fn().mockImplementation(async (pattern: string, data: any) => {
        if (pattern === 'user.auth-status') {
          return userTrustService.getUserAuthStatus(data.userId, data.roles);
        }
        return { exists: true, status: 'active', isProvisioned: true };
      }),
    };

    const rateLimiterMock = {
      checkAndIncrement: vi.fn().mockResolvedValue({
        allowed: true,
        remainingPoints: 10,
        msBeforeNext: 1000,
        consumedPoints: 1,
        isBlocked: false,
        resetInSeconds: 3600,
      }),
      checkFailedLogins: vi.fn().mockResolvedValue(undefined),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      resetFailedLogins: vi.fn().mockResolvedValue(undefined),
      checkResendLimit: vi.fn().mockResolvedValue(undefined),
      getRemainingCooldown: vi.fn().mockResolvedValue(0),
      reset: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
      providers: [
        AuthServiceService,
        RegisterFlowService,
        OtpFlowService,
        LoginFlowService,
        SessionService,
        UserTrustClient,
        UserTrustServiceService,
        { provide: AuthPrismaService, useValue: authDbMock },
        { provide: UserTrustPrismaService, useValue: userTrustDbMock },
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
            internalServiceSecret: 'test-internal-secret',
            otpSecret: 'test-otp-secret',
          },
        },
      ],
    }).compile();

    authService = module.get<AuthServiceService>(AuthServiceService);
    userTrustService = module.get<UserTrustServiceService>(UserTrustServiceService);
    verifier = module.get<TokenVerifierService>(TokenVerifierService);
  });

  it('completes the entire Unified Registration, Event v3 Processing, Verification, Login & Profile Retrieval', async () => {
    // ---------------------------------------------------------------------------------------------
    // STEP 1: Registration request without role field
    // ---------------------------------------------------------------------------------------------
    authDbMock.account.findUnique.mockResolvedValue(null);

    let createdAccountData: any = null;
    let createdOutboxEvent: any = null;

    authDbMock.account.create.mockImplementation(async ({ data }: any) => {
      createdAccountData = data;
      return {
        id: data.id,
        userId: data.userId,
        phone: data.phone,
        email: data.email,
        status: data.status,
        emailVerifiedAt: null,
      };
    });

    authDbMock.outboxEvent.create.mockImplementation(async ({ data }: any) => {
      createdOutboxEvent = data;
      return data;
    });

    // Client registration payload does NOT contain `role`
    const registerPayload = {
      fullName: 'Nguyen Van Thong Nhat',
      phone: '0988776655',
      email: 'unified.user@handygo.vn',
      password: 'StrongP@ssword2026',
    };

    const registerResponse = await authService.register(registerPayload, '192.168.1.100');

    // Assert Registration Output
    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.data.userId).toBeDefined();
    expect(registerResponse.data.challengeId).toBeDefined();
    expect(registerResponse.data.phone).toBe('+84988776655');

    // Assert Account Roles in DB: Both preseeded roles are assigned atomically
    expect(authDbMock.role.findMany).toHaveBeenCalledWith({
      where: { code: { in: ['CUSTOMER', 'WORKER'] } },
    });
    expect(createdAccountData.roles.create).toEqual([
      { roleId: 'role-cust-id', assignedAt: expect.any(Date) },
      { roleId: 'role-work-id', assignedAt: expect.any(Date) },
    ]);

    // Assert Domain Event v3 in Outbox: Contains roles: ["Customer", "Worker"] and eventVersion: 3
    expect(createdOutboxEvent.eventType).toBe('user.registered');
    expect(createdOutboxEvent.eventVersion).toBe(3);
    expect(createdOutboxEvent.payload.eventVersion).toBe(3);
    expect(createdOutboxEvent.payload.data).toEqual({
      userId: createdAccountData.userId,
      accountId: createdAccountData.id,
      fullName: 'Nguyen Van Thong Nhat',
      roles: [RegisterRole.CUSTOMER, RegisterRole.WORKER],
    });

    // ---------------------------------------------------------------------------------------------
    // STEP 2: User & Trust Service consumes Domain Event v3
    // ---------------------------------------------------------------------------------------------
    const domainEventV3: DomainEvent<UserRegisteredData> = {
      eventId: createdOutboxEvent.id,
      eventVersion: createdOutboxEvent.eventVersion,
      occurredAt: new Date(),
      producer: 'auth-service',
      data: createdOutboxEvent.payload.data,
    };

    const consumerResult = await userTrustService.handleUserRegistered(domainEventV3);
    expect(consumerResult.processed).toBe(true);
    expect(consumerResult.idempotent).toBe(false);

    // Verify both CustomerProfile and WorkerProfile were provisioned in User & Trust
    const provisionedUser = userTrustState.users.get(createdAccountData.userId);
    expect(provisionedUser).toBeDefined();
    expect(provisionedUser.fullName).toBe('Nguyen Van Thong Nhat');
    expect(provisionedUser.status).toBe('active');

    const customerProfile = userTrustState.customerProfiles.get(createdAccountData.userId);
    expect(customerProfile).toBeDefined();
    expect(customerProfile.userId).toBe(createdAccountData.userId);

    const workerProfile = userTrustState.workerProfiles.get(createdAccountData.userId);
    expect(workerProfile).toBeDefined();
    expect(workerProfile.userId).toBe(createdAccountData.userId);
    expect(workerProfile.status).toBe('draft'); // Unverified worker profile starts in draft
    expect(workerProfile.verifiedAt).toBeNull();

    // Verify NO kycCase created
    expect(userTrustState.kycCases.size).toBe(0);

    // Verify idempotent re-delivery
    const replayResult = await userTrustService.handleUserRegistered(domainEventV3);
    expect(replayResult.processed).toBe(true);
    expect(replayResult.idempotent).toBe(true);

    // ---------------------------------------------------------------------------------------------
    // STEP 3: OTP Verification & Session Issuance
    // ---------------------------------------------------------------------------------------------
    const accountRolesWithPermissions = [
      {
        role: {
          name: 'Customer',
          permissionRoles: [
            { permission: { code: 'auth:me' } },
            { permission: { code: 'profile:read' } },
            { permission: { code: 'profile:update' } },
          ],
        },
      },
      {
        role: {
          name: 'Worker',
          permissionRoles: [
            { permission: { code: 'auth:me' } },
            { permission: { code: 'profile:read' } },
            { permission: { code: 'profile:update' } },
          ],
        },
      },
    ];

    const activatedAccount = {
      id: createdAccountData.id,
      userId: createdAccountData.userId,
      phone: createdAccountData.phone,
      email: createdAccountData.email,
      passwordHash: createdAccountData.passwordHash,
      status: 'pending',
      emailVerifiedAt: null,
      roles: accountRolesWithPermissions,
      otpChallenges: [
        {
          id: 'challenge-new',
          otpHash: 'mock_otp_hash_123456',
          attempts: 0,
          expiresAt: new Date(Date.now() + 600000),
          isUsed: false,
        },
      ],
    };

    authDbMock.account.findFirst.mockResolvedValue(activatedAccount);
    authDbMock.otpChallenge.findFirst.mockResolvedValue({
      id: 'challenge-new',
      otpHash: 'mock_otp_hash_123456',
      attempts: 0,
      expiresAt: new Date(Date.now() + 600000),
      isUsed: false,
      deliveryStatus: 'delivered',
    });

    const verifyOtpResponse = await authService.verifyEmail(
      {
        phone: '0988776655',
        otp: '123456',
      },
      '192.168.1.100',
    );

    expect(verifyOtpResponse.statusCode).toBe(200);
    expect(verifyOtpResponse.data.user.roles).toEqual(['Customer', 'Worker']);

    // ---------------------------------------------------------------------------------------------
    // STEP 4: Login & RS256 JWT Verification
    // ---------------------------------------------------------------------------------------------
    const activeAccountForLogin = {
      ...activatedAccount,
      status: 'active',
      emailVerifiedAt: new Date(),
    };
    authDbMock.account.findUnique.mockResolvedValue(activeAccountForLogin);

    const loginResponse = await authService.login(
      {
        phone: '0988776655',
        password: 'StrongP@ssword2026',
      },
      '192.168.1.100',
    );

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.data.user.roles).toEqual(['Customer', 'Worker']);

    // Verify RS256 JWT Token contains both Customer and Worker roles
    const decodedJwt = await verifier.verifyAccessToken(loginResponse.data.accessToken);
    expect(decodedJwt.roles).toEqual(['Customer', 'Worker']);
    expect(decodedJwt.userId).toBe(createdAccountData.userId);

    // ---------------------------------------------------------------------------------------------
    // STEP 5: Token Refresh
    // ---------------------------------------------------------------------------------------------
    authDbMock.refreshSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      accountId: createdAccountData.id,
      refreshTokenHash: 'mock_hash',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      revokedAt: null,
    });

    const refreshResponse = await authService.loginFlow['sessionService'].rotateSession(
      loginResponse.data.refreshToken,
      '192.168.1.100',
    );
    expect(refreshResponse.user.roles).toEqual(['Customer', 'Worker']);

    // ---------------------------------------------------------------------------------------------
    // STEP 6: /auth/me returns both roles
    // ---------------------------------------------------------------------------------------------
    const meResponse = await authService.getMe(createdAccountData.id);
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.data.roles).toEqual(['Customer', 'Worker']);

    // ---------------------------------------------------------------------------------------------
    // STEP 7: GET /users/me returns both profiles non-null
    // ---------------------------------------------------------------------------------------------
    const userMeResponse: any = await userTrustService.getProfile(
      createdAccountData.userId,
      createdAccountData.userId,
      ['profile:read'],
    );

    expect(userMeResponse.statusCode).toBe(200);
    expect(userMeResponse.data.customerProfile).not.toBeNull();
    expect(userMeResponse.data.workerProfile).not.toBeNull();
    expect(userMeResponse.data.workerProfile.status).toBe('draft');
    expect(userMeResponse.data.workerProfile.verifiedAt).toBeNull();

    // ---------------------------------------------------------------------------------------------
    // STEP 8: Prepare Sanitized Evidence Output for Audit / Acceptance
    // ---------------------------------------------------------------------------------------------
    const sanitizedRegister = {
      statusCode: registerResponse.statusCode,
      message: registerResponse.message,
      data: {
        userId: registerResponse.data.userId,
        phone: registerResponse.data.phone.replace(/(\+\d{4})\d+(\d{2})/, '$1***$2'),
        email: registerResponse.data.emailMasked,
        verificationInstructions: registerResponse.data.verificationInstructions,
      },
    };

    const sanitizedLogin = {
      statusCode: loginResponse.statusCode,
      message: loginResponse.message,
      data: {
        accessToken: `${loginResponse.data.accessToken.slice(0, 16)}...[REDACTED]`,
        refreshToken: `${loginResponse.data.refreshToken.slice(0, 16)}...[REDACTED]`,
        expiresIn: loginResponse.data.expiresIn,
        user: {
          id: loginResponse.data.user.id,
          phone: loginResponse.data.user.phone?.replace(/(\+\d{4})\d+(\d{2})/, '$1***$2'),
          email: 'u***@handygo.vn',
          roles: loginResponse.data.user.roles,
          permissions: loginResponse.data.user.permissions,
        },
      },
    };

    const sanitizedUsersMe = {
      statusCode: userMeResponse.statusCode,
      message: userMeResponse.message,
      data: {
        id: userMeResponse.data.id,
        fullName: userMeResponse.data.fullName,
        status: userMeResponse.data.status,
        customerProfile: {
          id: userMeResponse.data.customerProfile.id,
          userId: userMeResponse.data.customerProfile.userId,
          createdAt: userMeResponse.data.customerProfile.createdAt,
        },
        workerProfile: {
          id: userMeResponse.data.workerProfile.id,
          userId: userMeResponse.data.workerProfile.userId,
          status: userMeResponse.data.workerProfile.status,
          verifiedAt: userMeResponse.data.workerProfile.verifiedAt,
          createdAt: userMeResponse.data.workerProfile.createdAt,
        },
      },
    };

    expect(sanitizedRegister.data.userId).toBe(createdAccountData.userId);
    expect(sanitizedLogin.data.user.roles).toEqual(['Customer', 'Worker']);
    expect(sanitizedUsersMe.data.customerProfile).toBeDefined();
    expect(sanitizedUsersMe.data.workerProfile.status).toBe('draft');
  });
});
