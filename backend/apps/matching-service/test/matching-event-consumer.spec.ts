import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MatchingEventConsumer } from '../src/consumers/matching-event.consumer.js';

describe('MatchingEventConsumer Idempotency & Lifecycle Handling', () => {
  let consumer: MatchingEventConsumer;
  let mockConsumedEvents: any;
  let mockProjectionService: any;
  let mockJobQueue: any;
  let mockChannel: any;
  let mockContext: any;

  beforeEach(() => {
    mockConsumedEvents = {
      isEventConsumed: vi.fn().mockResolvedValue(false),
      recordFailure: vi.fn().mockResolvedValue(false),
      markEventConsumed: vi.fn().mockResolvedValue(undefined),
    };

    mockProjectionService = {
      upsertPublishedRequest: vi.fn().mockResolvedValue({}),
      updateMatchingInputs: vi.fn().mockResolvedValue(undefined),
      updateRequestStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockJobQueue = {
      enqueueAndWait: vi.fn().mockResolvedValue(undefined),
    };

    mockChannel = {
      ack: vi.fn(),
      nack: vi.fn(),
    };

    mockContext = {
      getChannelRef: () => mockChannel,
      getMessage: () => ({ fields: { deliveryTag: 1 } }),
    };

    consumer = new MatchingEventConsumer(
      mockConsumedEvents,
      mockProjectionService,
      mockJobQueue,
    );
  });

  const samplePublishedEvent = {
    eventId: 'evt-pub-123',
    eventVersion: 1,
    occurredAt: new Date(),
    producer: 'order-service',
    data: {
      serviceRequestId: 'req-001',
      requestCode: 'REQ-20261025-001',
      customerUserId: 'cust-123',
      serviceId: 'srv-electrical',
      description: 'Sửa đường điện',
      latitude: 10.772,
      longitude: 106.6983,
      matchingRevision: 1,
    },
  };

  it('Initial Publication: should check idempotency, update projection, enqueue matching job, and ACK', async () => {
    const res = await consumer.handleServiceRequestPublished(
      samplePublishedEvent,
      mockContext,
    );

    expect(res.status).toBe('enqueued');
    expect(mockConsumedEvents.isEventConsumed).toHaveBeenCalledWith(
      'evt-pub-123',
    );
    expect(mockProjectionService.upsertPublishedRequest).toHaveBeenCalledTimes(
      1,
    );
    expect(mockJobQueue.enqueueAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'MATCH-req-001-REV1-RUN1',
        serviceRequestId: 'req-001',
        requestRevision: 1,
      }),
    );
    expect(mockConsumedEvents.markEventConsumed).toHaveBeenCalledWith(
      'evt-pub-123',
      'service_request.published',
    );
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);
  });

  it('Payload Compatibility: should correctly extract requestId when serviceRequestId is absent', async () => {
    const eventWithRequestId = {
      eventId: 'evt-pub-requestId-only',
      eventVersion: 1,
      occurredAt: new Date(),
      producer: 'order-service',
      payload: {
        requestId: 'req-from-order-service',
        requestCode: 'REQ-ORD-001',
        customerUserId: 'cust-456',
        serviceId: 'srv-cleaning',
        description: 'Vệ sinh',
        latitude: 10.77,
        longitude: 106.69,
      },
    };

    const res = await consumer.handleServiceRequestPublished(
      eventWithRequestId,
      mockContext,
    );

    expect(res.status).toBe('enqueued');
    expect(mockProjectionService.upsertPublishedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-from-order-service',
        customerUserId: 'cust-456',
      }),
    );
    expect(mockJobQueue.enqueueAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'MATCH-req-from-order-service-REV1-RUN1',
        serviceRequestId: 'req-from-order-service',
      }),
    );
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);
  });

  it('Idempotency: duplicate publication event should be ACKed without re-enqueuing', async () => {
    mockConsumedEvents.isEventConsumed.mockResolvedValueOnce(true); // already consumed!

    const res = await consumer.handleServiceRequestPublished(
      samplePublishedEvent,
      mockContext,
    );

    expect(res.status).toBe('duplicate');
    expect(mockJobQueue.enqueueAndWait).not.toHaveBeenCalled();
    expect(mockProjectionService.upsertPublishedRequest).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);
  });

  it('Inputs Changed: should update projection and enqueue matching job for revision 2', async () => {
    const inputsChangedEvent = {
      eventId: 'evt-change-456',
      eventVersion: 1,
      occurredAt: new Date(),
      producer: 'order-service',
      data: {
        serviceRequestId: 'req-001',
        customerUserId: 'cust-123',
        matchingRevision: 2,
        serviceId: 'srv-electrical',
        description: 'Mô tả sửa đổi',
        latitude: 10.78,
        longitude: 106.7,
      },
    };

    const res = await consumer.handleMatchingInputsChanged(
      inputsChangedEvent,
      mockContext,
    );

    expect(res.status).toBe('enqueued');
    expect(mockProjectionService.updateMatchingInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-001',
        matchingRevision: 2,
      }),
    );
    expect(mockJobQueue.enqueueAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'MATCH-req-001-REV2-RUN1',
        serviceRequestId: 'req-001',
        requestRevision: 2,
      }),
    );
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);
  });

  it('Cancellation: should update projection status to cancelled and ACK', async () => {
    const cancelledEvent = {
      eventId: 'evt-cancel-789',
      data: {
        serviceRequestId: 'req-001',
        reason: 'Khách hàng đổi ý',
        cancelledAt: new Date().toISOString(),
      },
    };

    const res = await consumer.handleServiceRequestCancelled(
      cancelledEvent,
      mockContext,
    );

    expect(res.status).toBe('processed');
    expect(mockProjectionService.updateRequestStatus).toHaveBeenCalledWith(
      'req-001',
      'cancelled',
    );
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);
  });

  it('Converted to Order: should update projection status to converted_to_order and ACK', async () => {
    const convertedEvent = {
      eventId: 'evt-conv-999',
      data: {
        serviceRequestId: 'req-001',
        orderId: 'order-xyz',
        convertedAt: new Date().toISOString(),
      },
    };

    const res = await consumer.handleServiceRequestConverted(
      convertedEvent,
      mockContext,
    );

    expect(res.status).toBe('processed');
    expect(mockProjectionService.updateRequestStatus).toHaveBeenCalledWith(
      'req-001',
      'converted_to_order',
    );
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);
  });
  it('holds ACK and inbox until the queued processor actually completes', async () => {
    let complete!: () => void;
    mockJobQueue.enqueueAndWait.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const pending = consumer.handleServiceRequestPublished(
      samplePublishedEvent,
      mockContext,
    );
    await vi.waitFor(() =>
      expect(mockJobQueue.enqueueAndWait).toHaveBeenCalled(),
    );
    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockConsumedEvents.markEventConsumed).not.toHaveBeenCalled();
    complete();
    await pending;
    expect(mockChannel.ack).toHaveBeenCalledOnce();
  });

  it.each([
    'handleServiceRequestBiddingClosed',
    'handleServiceRequestExpired',
  ] as const)('requeues %s on a transient projection error', async (method) => {
    mockProjectionService.updateRequestStatus.mockRejectedValueOnce(
      new Error('DB offline'),
    );
    await expect(
      consumer[method](samplePublishedEvent, mockContext),
    ).rejects.toThrow('DB offline');
    expect(mockChannel.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true,
    );
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('ACKs an exhausted delivery only after durable dead-letter persistence', async () => {
    mockJobQueue.enqueueAndWait.mockRejectedValueOnce(new Error('offline'));
    mockConsumedEvents.recordFailure.mockResolvedValueOnce(true);
    await expect(
      consumer.handleServiceRequestPublished(samplePublishedEvent, mockContext),
    ).rejects.toThrow('offline');
    expect(mockConsumedEvents.recordFailure).toHaveBeenCalledOnce();
    expect(mockChannel.ack).toHaveBeenCalledOnce();
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });
});
