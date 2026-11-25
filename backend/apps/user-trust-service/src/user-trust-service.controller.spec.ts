import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';
import { RegisterRole, TokenVerifierService } from '@app/auth';
import { ConfigService } from '@app/config';

describe('UserTrustServiceController', () => {
  let controller: UserTrustServiceController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getHello: vi.fn().mockReturnValue('Hello World!'),
      handleUserRegistered: vi.fn().mockResolvedValue({ processed: true }),
      handleOrderCompleted: vi.fn().mockResolvedValue({ processed: true }),
      handleOrderCreated: vi.fn().mockResolvedValue({ processed: true }),
      recordDeadLetter: vi.fn().mockResolvedValue(undefined),
      getProfile: vi.fn().mockResolvedValue({ statusCode: 200 }),
      updateProfile: vi.fn().mockResolvedValue({ statusCode: 200 }),
      listUsers: vi.fn().mockResolvedValue({ statusCode: 200, data: [], pagination: {} }),
      uploadAvatar: vi.fn().mockResolvedValue({ statusCode: 200 }),
      getBankAccounts: vi.fn().mockResolvedValue({ statusCode: 200 }),
      addBankAccount: vi.fn().mockResolvedValue({ statusCode: 201 }),
      deleteBankAccount: vi.fn().mockResolvedValue({ statusCode: 200 }),
      getWorkerPublicProfile: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'w1' } }),
      getWorkerOrderSummary: vi.fn().mockResolvedValue({ statusCode: 200, data: { workerUserId: 'w1' } }),
      getWorkerReviews: vi.fn().mockResolvedValue({ statusCode: 200, data: [], pagination: {} }),
      submitWorkerServiceRegistration: vi.fn().mockResolvedValue({ statusCode: 201, data: { id: 'reg-1' } }),
      updateWorkerServiceRegistration: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'reg-1' } }),
      getMyServiceRegistrations: vi.fn().mockResolvedValue({ statusCode: 200, data: [] }),
      listAdminServiceRegistrations: vi.fn().mockResolvedValue({ statusCode: 200, data: [], pagination: {} }),
      getAdminServiceRegistrationDetail: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'reg-1' } }),
      reviewServiceRegistration: vi.fn().mockResolvedValue({ statusCode: 200, data: { status: 'approved' } }),
      geocodeAddress: vi.fn().mockResolvedValue({ statusCode: 200, data: { latitude: 16.0544, longitude: 108.2022 } }),
      updateServiceOffering: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'offering-1', isActive: true } }),
      createReview: vi.fn().mockResolvedValue({ statusCode: 201, data: { id: 'rev-1' } }),
      getReviewByOrderId: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'rev-1' } }),
      getReviewById: vi.fn().mockResolvedValue({ statusCode: 200, data: { id: 'rev-1' } }),
      createReviewVideoSignature: vi.fn().mockResolvedValue({ statusCode: 200, data: { signature: 'sig' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserTrustServiceController],
      providers: [
        { provide: UserTrustServiceService, useValue: serviceMock },
        { provide: TokenVerifierService, useValue: { verifyAccessToken: vi.fn() } },
        {
          provide: ConfigService,
          useValue: { internalServiceSecret: 'secret-1' },
        },
      ],
    }).compile();

    controller = module.get<UserTrustServiceController>(
      UserTrustServiceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle user.registered domain event via RabbitMQ handler', async () => {
    const event = {
      eventId: 'evt-1',
      producer: 'auth-service',
      data: {
        userId: 'user-1',
        accountId: 'acc-1',
        fullName: 'Test User',
        phone: '+84912345678',
        email: 'test@example.com',
      },
    } as any;

    const result = await controller.handleUserRegistered(event, undefined as any);
    expect(result).toEqual({ processed: true });
    expect(serviceMock.handleUserRegistered).toHaveBeenCalledWith(event);
  });

  it('should handle order.completed event and ack channel', async () => {
    const event = {
      eventId: 'evt-order-1',
      data: { orderId: 'ord-1', workerUserId: 'w-1' },
    } as any;
    const channelMock = { ack: vi.fn(), nack: vi.fn() };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({}),
    };

    const result = await controller.handleOrderCompleted(event, contextMock);
    expect(result).toEqual({ processed: true });
    expect(serviceMock.handleOrderCompleted).toHaveBeenCalledWith(event);
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should nack without requeue when payload is malformed (missing orderId or workerUserId)', async () => {
    const malformedEvent = { eventId: 'evt-order-err', data: {} } as any;
    const channelMock = { ack: vi.fn(), nack: vi.fn() };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({}),
    };

    const result = await controller.handleOrderCompleted(malformedEvent, contextMock);
    expect(result).toEqual({ processed: false, reason: 'MALFORMED_PAYLOAD' });
    expect(channelMock.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(serviceMock.handleOrderCompleted).not.toHaveBeenCalled();
  });

  it('should retry transient DB error with requeue up to max retries', async () => {
    const event = {
      eventId: 'evt-transient-1',
      data: { orderId: 'ord-1', workerUserId: 'w-1' },
    } as any;
    const channelMock = { ack: vi.fn(), nack: vi.fn() };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({}),
    };
    serviceMock.handleOrderCompleted.mockRejectedValueOnce(new Error('Connection timeout to PostgreSQL'));

    await expect(controller.handleOrderCompleted(event, contextMock)).rejects.toThrow('Connection timeout');
    expect(channelMock.nack).toHaveBeenCalledWith(expect.anything(), false, true); // requeue = true
  });

  it('recovers on second retry attempt and ACKs channel', async () => {
    const event = {
      eventId: 'evt-retry-recover',
      data: { orderId: 'ord-recover', workerUserId: 'w-1' },
    } as any;
    const channelMock = { ack: vi.fn(), nack: vi.fn() };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({}),
    };

    // First attempt fails with transient DB error
    serviceMock.handleOrderCompleted.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    await expect(controller.handleOrderCompleted(event, contextMock)).rejects.toThrow('connection terminated');
    expect(channelMock.nack).toHaveBeenCalledWith(expect.anything(), false, true);

    // Second attempt recovers
    channelMock.nack.mockClear();
    serviceMock.handleOrderCompleted.mockResolvedValueOnce({ processed: true, idempotent: false });
    const result = await controller.handleOrderCompleted(event, contextMock);

    expect(result).toEqual({ processed: true, idempotent: false });
    expect(channelMock.ack).toHaveBeenCalled();
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should persist dead letter to durable broker DLQ when DB is down throughout retries and only ACK after DLQ confirms', async () => {
    const event = {
      eventId: 'evt-exhaust-retries',
      data: { orderId: 'ord-exhaust', workerUserId: 'w-1' },
    } as any;
    let currentHeaders: Record<string, any> = {};
    const channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
      assertQueue: vi.fn().mockResolvedValue({}),
      sendToQueue: vi.fn((_queue: string, _content: Buffer, opts: any) => {
        currentHeaders = { ...(opts?.headers ?? {}) };
        return true;
      }),
      waitForConfirms: vi.fn().mockResolvedValue(undefined),
    };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({
        content: Buffer.from(JSON.stringify(event)),
        properties: { headers: currentHeaders },
      }),
    };

    serviceMock.handleOrderCompleted.mockRejectedValue(new Error('Persistent connection refused'));
    serviceMock.recordDeadLetter.mockResolvedValue(false); // DB is still down when DLQ DB record is attempted

    // Attempts 1, 2, 3 publish to broker retry queues with x-retry-count and ACK original
    for (let i = 1; i <= 3; i++) {
      channelMock.ack.mockClear();
      channelMock.sendToQueue.mockClear();
      await expect(controller.handleOrderCompleted(event, contextMock)).rejects.toThrow();
      expect(channelMock.sendToQueue).toHaveBeenCalledWith(
        `user-trust-service.retry.${i}`,
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({ 'x-retry-count': i }),
        }),
      );
      expect(channelMock.ack).toHaveBeenCalledTimes(1);
      expect(channelMock.nack).not.toHaveBeenCalled();
    }

    // Attempt 4 (exhausted) publishes to broker DLQ even though DB recordDeadLetter failed, then ACKs original
    channelMock.ack.mockClear();
    channelMock.sendToQueue.mockClear();
    await expect(controller.handleOrderCompleted(event, contextMock)).rejects.toThrow();
    expect(channelMock.sendToQueue).toHaveBeenCalledWith(
      'user-trust-service.dlq',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ 'x-retry-count': 4, 'x-event-type': 'order.completed' }),
      }),
    );
    expect(channelMock.ack).toHaveBeenCalledTimes(1);
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('does NOT drop message if both broker DLQ publish and DB recordDeadLetter fail during outage', async () => {
    const event = {
      eventId: 'evt-dlq-fail',
      data: { orderId: 'ord-dlq-fail', workerUserId: 'w-1' },
    } as any;
    const channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
      assertQueue: vi.fn().mockRejectedValue(new Error('Broker unreachable')),
      sendToQueue: vi.fn(),
    };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({
        content: Buffer.from(JSON.stringify(event)),
        properties: { headers: { 'x-retry-count': 3 } },
      }),
    };

    serviceMock.handleOrderCompleted.mockRejectedValueOnce(new Error('DB connection refused'));
    serviceMock.recordDeadLetter.mockResolvedValueOnce(false);

    await expect(controller.handleOrderCompleted(event, contextMock)).rejects.toThrow();
    expect(channelMock.ack).not.toHaveBeenCalled();
    expect(channelMock.nack).toHaveBeenCalledWith(expect.anything(), false, true); // Must requeue, never drop
  });

  it('preserves retry count across instance restart via AMQP headers and avoids double counting on replay', async () => {
    const event = {
      eventId: 'evt-restart-1',
      data: { orderId: 'ord-restart', workerUserId: 'w-1' },
    } as any;

    // Simulate a brand new controller instance after pod restart receiving message with x-retry-count = 2
    const restartedController = new UserTrustServiceController(
      serviceMock as any,
      { internalServiceSecret: 'secret-1' } as any,
    );
    const channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
      assertQueue: vi.fn().mockResolvedValue({}),
      sendToQueue: vi.fn().mockReturnValue(true),
    };
    const contextAttempt3 = {
      getChannelRef: () => channelMock,
      getMessage: () => ({
        content: Buffer.from(JSON.stringify(event)),
        properties: { headers: { 'x-retry-count': 2 } },
      }),
    };

    // Attempt 3 (from header 2 -> 3) still fails -> publishes to retry.3
    serviceMock.handleOrderCompleted.mockRejectedValueOnce(new Error('Connection timeout'));
    await expect(restartedController.handleOrderCompleted(event, contextAttempt3)).rejects.toThrow();
    expect(channelMock.sendToQueue).toHaveBeenCalledWith(
      'user-trust-service.retry.3',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-retry-count': 3 }),
      }),
    );

    // DB recovers -> replay succeeds once, subsequent replay is idempotent
    channelMock.ack.mockClear();
    serviceMock.handleOrderCompleted
      .mockResolvedValueOnce({ processed: true, idempotent: false })
      .mockResolvedValueOnce({ processed: false, idempotent: true });

    const firstRecovery = await restartedController.handleOrderCompleted(event, {
      getChannelRef: () => channelMock,
      getMessage: () => ({ properties: { headers: { 'x-retry-count': 3 } } }),
    });
    expect(firstRecovery).toEqual({ processed: true, idempotent: false });

    const duplicateReplay = await restartedController.handleOrderCompleted(event, {
      getChannelRef: () => channelMock,
      getMessage: () => ({ properties: { headers: { 'x-retry-count': 3 } } }),
    });
    expect(duplicateReplay).toEqual({ processed: false, idempotent: true });
    expect(channelMock.ack).toHaveBeenCalledTimes(2);
  });

  it('should handle order.created event and ack channel', async () => {
    const event = {
      eventId: 'evt-order-created-1',
      data: { orderId: 'ord-1', workerUserId: 'w-1' },
    } as any;
    const channelMock = { ack: vi.fn(), nack: vi.fn() };
    const contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({}),
    };

    const result = await controller.handleOrderCreated(event, contextMock);
    expect(result).toEqual({ processed: true });
    expect(serviceMock.handleOrderCreated).toHaveBeenCalledWith(event);
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('should return profile for authenticated user', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:read'],
    };

    const result = await controller.getMyProfile(user);
    expect(result).toEqual({ statusCode: 200 });
    expect(serviceMock.getProfile).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ['profile:read'],
    );
  });

  it('should update profile and handle avatar upload via updateMyProfile', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:update'],
    };

    const result = await controller.updateMyProfile(user, { fullName: 'Updated Name' });
    expect(result).toEqual({ statusCode: 200 });
    expect(serviceMock.updateProfile).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      { fullName: 'Updated Name' },
      ['profile:update'],
    );
  });

  it('should upload avatar via uploadMyAvatar', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:update'],
    };

    const fakeFile = { buffer: Buffer.from('img') } as any;
    const result = await controller.uploadMyAvatar(user, { file: [fakeFile] });
    expect(result).toEqual({ statusCode: 200 });
    expect(serviceMock.uploadAvatar).toHaveBeenCalledWith('user-1', fakeFile);
  });

  it('should delegate bank account requests to service', async () => {
    const user = {
      accountId: 'acc-1',
      userId: 'user-1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:read', 'profile:update'],
    };

    await controller.getMyBankAccounts(user);
    expect(serviceMock.getBankAccounts).toHaveBeenCalledWith('user-1');

    await controller.addMyBankAccount(user, {
      bankCode: 'VCB',
      bankName: 'Vietcombank',
      accountNumber: '123',
      accountHolderName: 'NGUYEN A',
    });
    expect(serviceMock.addBankAccount).toHaveBeenCalledWith('user-1', expect.objectContaining({ bankCode: 'VCB' }));

    await controller.deleteMyBankAccount(user, 'bank-1');
    expect(serviceMock.deleteBankAccount).toHaveBeenCalledWith('user-1', 'bank-1');
  });

  it('should call service.listUsers for admin list users', async () => {
    const query = { page: 1, limit: 10, search: 'test', role: 'customer' as const };
    const result = await controller.listUsers(query);
    expect(result).toEqual({ statusCode: 200, data: [], pagination: {} });
    expect(serviceMock.listUsers).toHaveBeenCalledWith(query);

    const adminResult = await controller.listAdminUsers(query);
    expect(adminResult).toEqual({ statusCode: 200, data: [], pagination: {} });
  });

  describe('verifyBankAccount (internal)', () => {
    const body = { userId: 'u1', bankAccountId: 'b1' };

    it('returns ownership result for a valid secret', async () => {
      serviceMock.verifyBankAccountOwnership = vi
        .fn()
        .mockResolvedValue({ owned: true, active: true });
      await expect(controller.verifyBankAccount('secret-1', body)).resolves.toEqual({
        owned: true,
        active: true,
      });
      expect(serviceMock.verifyBankAccountOwnership).toHaveBeenCalledWith('u1', 'b1');
    });

    it('rejects missing or wrong secret', async () => {
      await expect(controller.verifyBankAccount(undefined, body)).rejects.toThrow();
      await expect(controller.verifyBankAccount('wrong-12', body)).rejects.toThrow();
    });

    it('rejects missing params', async () => {
      await expect(
        controller.verifyBankAccount('secret-1', { userId: 'u1' }),
      ).rejects.toThrow();
    });
  });

  it('should handle user.get-all-active-ids MessagePattern', async () => {
    serviceMock.getAllActiveUserIds = vi.fn().mockResolvedValue({
      userIds: ['user-1', 'user-2'],
    });

    const result = await controller.getAllActiveUserIds(
      { targetGroup: 'ALL' },
      undefined,
    );
    expect(result).toEqual({ userIds: ['user-1', 'user-2'] });
    expect(serviceMock.getAllActiveUserIds).toHaveBeenCalledWith('ALL');
  });

  it('should serve the order worker summary through both user routes', async () => {
    const expected = { statusCode: 200, data: { workerUserId: 'worker-1' } };
    serviceMock.getWorkerOrderSummary.mockResolvedValue(expected);

    expect(await controller.getWorkerPublicProfile('worker-1')).toEqual(expected);
    expect(await controller.getWorkerPublicProfileAlias('worker-1')).toEqual(expected);
    expect(serviceMock.getWorkerOrderSummary).toHaveBeenCalledTimes(2);
    expect(serviceMock.getWorkerOrderSummary).toHaveBeenCalledWith('worker-1');
  });

  it('should call service.getWorkerPublicProfile for getWorkerProfile and alias', async () => {
    const res1 = await controller.getWorkerProfile('worker-1');
    expect(res1).toEqual({ statusCode: 200, data: { id: 'w1' } });
    expect(serviceMock.getWorkerPublicProfile).toHaveBeenCalledWith('worker-1');

    const res2 = await controller.getWorkerProfileAlias('worker-1');
    expect(res2).toEqual({ statusCode: 200, data: { id: 'w1' } });
  });

  it('should call service.getWorkerReviews for getWorkerReviews', async () => {
    const query = { page: 1, limit: 10, rating: 5 };
    const res = await controller.getWorkerReviews('worker-1', query);
    expect(res).toEqual({ statusCode: 200, data: [], pagination: {} });
    expect(serviceMock.getWorkerReviews).toHaveBeenCalledWith('worker-1', query);
  });

  it('should call service.getWorkerReviews for getMyWorkerReviews with "me" and user.userId', async () => {
    const mockWorkerUser = {
      accountId: 'acc-w',
      userId: 'user-w1',
      sessionId: 'sess-w',
      roles: [RegisterRole.WORKER],
      permissions: ['profile:read'],
    };
    const query = { page: 1, limit: 10 };
    await controller.getMyWorkerReviews(mockWorkerUser, query);
    expect(serviceMock.getWorkerReviews).toHaveBeenCalledWith('me', query, 'user-w1');
  });

  it('should call service.getWorkerPublicProfile for getMyWorkerProfile with "me" and user.userId', async () => {
    const mockWorkerUser = {
      accountId: 'acc-w',
      userId: 'user-w1',
      sessionId: 'sess-w',
      roles: [RegisterRole.WORKER],
      permissions: ['profile:read'],
    };
    await controller.getMyWorkerProfile(mockWorkerUser);
    expect(serviceMock.getWorkerPublicProfile).toHaveBeenCalledWith('me', 'user-w1');
  });

  it('should call service.getWorkerReviews for getWorkerReviewsAlias', async () => {
    const query = { page: 1, limit: 10 };
    await controller.getWorkerReviewsAlias('worker-1', query);
    expect(serviceMock.getWorkerReviews).toHaveBeenCalledWith('worker-1', query);
  });

  describe('Order Reviews Controller Tests', () => {
    const mockUser = {
      accountId: 'acc-1',
      userId: 'user-c1',
      sessionId: 'sess-1',
      roles: [RegisterRole.CUSTOMER],
      permissions: ['profile:update', 'profile:read'],
    };

    it('createReview delegates to service with body and files', async () => {
      const dto = { rating: 5, comment: 'Tốt' };
      const res = await controller.createReview(mockUser, dto as any, undefined);
      expect(res).toEqual({ statusCode: 201, data: { id: 'rev-1' } });
      expect(serviceMock.createReview).toHaveBeenCalledWith(
        'user-c1',
        dto,
        undefined,
        undefined,
      );
    });

    it('createOrderReview delegates to service with orderId parameter', async () => {
      const dto = { rating: 5 };
      const res = await controller.createOrderReview(
        mockUser,
        'a0000000-0000-4000-8000-000000000001',
        dto as any,
        undefined,
      );
      expect(res).toEqual({ statusCode: 201, data: { id: 'rev-1' } });
      expect(serviceMock.createReview).toHaveBeenCalledWith(
        'user-c1',
        dto,
        'a0000000-0000-4000-8000-000000000001',
        undefined,
      );
    });

    it('getReviewByOrderId delegates to service', async () => {
      const mockUser = { userId: 'user-c1', roles: ['customer'], permissions: ['profile:read'] } as any;
      const res = await controller.getReviewByOrderId(mockUser, 'a0000000-0000-4000-8000-000000000001');
      expect(res).toEqual({ statusCode: 200, data: { id: 'rev-1' } });
      expect(serviceMock.getReviewByOrderId).toHaveBeenCalledWith(
        'a0000000-0000-4000-8000-000000000001',
        mockUser,
      );
    });

    it('getOrderReviewAlias delegates to service getReviewByOrderId', async () => {
      const mockUser = { userId: 'user-c1', roles: ['customer'], permissions: ['profile:read'] } as any;
      const res = await controller.getOrderReviewAlias(mockUser, 'a0000000-0000-4000-8000-000000000001');
      expect(res).toEqual({ statusCode: 200, data: { id: 'rev-1' } });
      expect(serviceMock.getReviewByOrderId).toHaveBeenCalledWith(
        'a0000000-0000-4000-8000-000000000001',
        mockUser,
      );
    });

    it('getReviewById delegates to service', async () => {
      const mockUser = { userId: 'user-c1', roles: ['customer'], permissions: ['profile:read'] } as any;
      const res = await controller.getReviewById(mockUser, 'b0000000-0000-4000-8000-000000000001');
      expect(res).toEqual({ statusCode: 200, data: { id: 'rev-1' } });
      expect(serviceMock.getReviewById).toHaveBeenCalledWith(
        'b0000000-0000-4000-8000-000000000001',
        mockUser,
      );
    });

    it('createReviewVideoSignature delegates to service', async () => {
      const res = await controller.createReviewVideoSignature(mockUser, {
        fileName: 'rev.mp4',
        mimeType: 'video/mp4',
      });
      expect(res).toEqual({ statusCode: 200, data: { signature: 'sig' } });
      expect(serviceMock.createReviewVideoSignature).toHaveBeenCalledWith('user-c1', {
        fileName: 'rev.mp4',
        mimeType: 'video/mp4',
      });
    });

    it('createReviewVideoSignature throws BadRequestException if mimeType is not video', async () => {
      await expect(
        controller.createReviewVideoSignature(mockUser, {
          fileName: 'rev.txt',
          mimeType: 'text/plain',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Worker Service Registration Controller Tests', () => {
    const mockUser = {
      accountId: 'acc-1',
      userId: 'user-w1',
      sessionId: 'sess-1',
      roles: [RegisterRole.WORKER],
      permissions: ['profile:update', 'profile:read'],
    };

    it('submitMyServiceRegistration delegates to service with idempotency key', async () => {
      const dto: any = {
        categoryIds: ['0986472e-1728-4731-82b2-ff77a7251326'],
        services: [{ serviceId: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4' }],
        serviceArea: { address: 'Đà Nẵng', latitude: 16.0544, longitude: 108.2022, radiusKm: 15 },
        evidenceFiles: [{ url: 'https://example.com/proof.jpg', fileType: 'image' }],
      };

      const res = await controller.submitMyServiceRegistration(mockUser, dto, 'idem-key-1');
      expect(res).toEqual({ statusCode: 201, data: { id: 'reg-1' } });
      expect(serviceMock.submitWorkerServiceRegistration).toHaveBeenCalledWith('user-w1', dto, 'idem-key-1');
    });

    it('updateMyServiceRegistration delegates to service with idempotency key', async () => {
      const dto: any = {
        categoryIds: ['0986472e-1728-4731-82b2-ff77a7251326'],
        services: [{ serviceId: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4' }],
        serviceArea: { address: 'Đà Nẵng', latitude: 16.0544, longitude: 108.2022, radiusKm: 15 },
        evidenceFiles: [{ url: 'https://example.com/proof.jpg', fileType: 'image' }],
      };

      const res = await controller.updateMyServiceRegistration(mockUser, 'reg-1', dto, undefined, 'x-idem-key-2');
      expect(res).toEqual({ statusCode: 200, data: { id: 'reg-1' } });
      expect(serviceMock.updateWorkerServiceRegistration).toHaveBeenCalledWith('user-w1', 'reg-1', dto, 'x-idem-key-2');
    });

    it('getMyServiceRegistrations delegates to service', async () => {
      const res = await controller.getMyServiceRegistrations(mockUser);
      expect(res).toEqual({ statusCode: 200, data: [] });
      expect(serviceMock.getMyServiceRegistrations).toHaveBeenCalledWith('user-w1');
    });

    it('geocodeAddress delegates to service', async () => {
      const res = await controller.geocodeAddress('Đà Nẵng');
      expect(res).toEqual({ statusCode: 200, data: { latitude: 16.0544, longitude: 108.2022 } });
      expect(serviceMock.geocodeAddress).toHaveBeenCalledWith('Đà Nẵng');
    });

    it('listAdminServiceRegistrations delegates to service', async () => {
      const query = { page: 1, limit: 10, status: 'pending' as const };
      const res = await controller.listAdminServiceRegistrations(query);
      expect(res).toEqual({ statusCode: 200, data: [], pagination: {} });
      expect(serviceMock.listAdminServiceRegistrations).toHaveBeenCalledWith(query);
    });

    it('getAdminServiceRegistrationDetail delegates to service', async () => {
      const res = await controller.getAdminServiceRegistrationDetail('reg-1');
      expect(res).toEqual({ statusCode: 200, data: { id: 'reg-1' } });
      expect(serviceMock.getAdminServiceRegistrationDetail).toHaveBeenCalledWith('reg-1');
    });

    it('reviewServiceRegistration delegates to service', async () => {
      const adminUser = {
        accountId: 'acc-admin',
        userId: 'admin-1',
        sessionId: 'sess-admin',
        roles: ['admin'],
        permissions: ['user:manage'],
      };
      const dto = { decision: 'approved' as const, expectedVersion: 1 };
      const res = await controller.reviewServiceRegistration(adminUser, 'reg-1', dto);
      expect(res).toEqual({ statusCode: 200, data: { status: 'approved' } });
      expect(serviceMock.reviewServiceRegistration).toHaveBeenCalledWith('admin-1', 'reg-1', dto);
    });

    it('updateServiceOffering delegates to service', async () => {
      const workerUser = {
        accountId: 'acc-w1',
        userId: 'user-w1',
        sessionId: 'sess-w1',
        roles: ['worker'],
        permissions: ['profile:update'],
      };
      const dto = { isActive: false };
      await controller.updateServiceOffering(workerUser, '00000000-0000-0000-0000-000000000001', dto);
      expect(serviceMock.updateServiceOffering).toHaveBeenCalledWith(
        'user-w1',
        '00000000-0000-0000-0000-000000000001',
        false,
      );
    });

    it('toggleServiceOffering delegates to service without boolean', async () => {
      const workerUser = {
        accountId: 'acc-w1',
        userId: 'user-w1',
        sessionId: 'sess-w1',
        roles: ['worker'],
        permissions: ['profile:update'],
      };
      await controller.toggleServiceOffering(workerUser, '00000000-0000-0000-0000-000000000001');
      expect(serviceMock.updateServiceOffering).toHaveBeenCalledWith(
        'user-w1',
        '00000000-0000-0000-0000-000000000001',
      );
    });
  });
});
