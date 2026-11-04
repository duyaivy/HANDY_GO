import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TrackingEventsConsumer } from './tracking-events.consumer.js';
import type { TrackingEventsService } from './tracking-events.service.js';

describe('TrackingEventsConsumer', () => {
  let consumer: TrackingEventsConsumer;
  let eventsServiceMock: any;
  let contextMock: any;
  let channelMock: any;

  beforeEach(() => {
    channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
    };

    contextMock = {
      getChannelRef: vi.fn().mockReturnValue(channelMock),
      getMessage: vi.fn().mockReturnValue({ properties: { messageId: '123' } }),
    };

    eventsServiceMock = {
      recordDomainEvent: vi.fn(),
    };

    consumer = new TrackingEventsConsumer(
      eventsServiceMock as unknown as TrackingEventsService,
    );
  });

  it.each(['P1001', 'P2028', 'P2034'])('requeues PostgreSQL failure %s without ACK', async (code) => {
    eventsServiceMock.recordDomainEvent.mockRejectedValue({ code, message: 'database operation failed' });
    await consumer.handleOrderStatusChanged({ eventId: randomUUID(), orderId: randomUUID() }, contextMock);
    expect(channelMock.ack).not.toHaveBeenCalled();
    expect(channelMock.nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('waits for the durable pending commit before ACK', async () => {
    let commit!: (value: any) => void;
    eventsServiceMock.recordDomainEvent.mockReturnValue(new Promise(resolve => { commit = resolve; }));
    const delivery = consumer.handleOrderStatusChanged({ eventId: randomUUID(), orderId: randomUUID() }, contextMock);
    expect(channelMock.ack).not.toHaveBeenCalled();
    commit({ recorded: false, reason: 'BUFFERED_PENDING_ORDER_CREATED' });
    await delivery;
    expect(channelMock.ack).toHaveBeenCalledTimes(1);
  });

  it('should acknowledge message upon successful event recording', async () => {
    eventsServiceMock.recordDomainEvent.mockResolvedValue({ recorded: true });

    const payload = {
      eventId: randomUUID(),
      serviceRequestId: randomUUID(),
    };

    await consumer.handleServiceRequestPublished(payload, contextMock);

    expect(eventsServiceMock.recordDomainEvent).toHaveBeenCalledWith(
      payload,
      'service_request.published',
    );
    expect(channelMock.ack).toHaveBeenCalled();
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should acknowledge message when event is deduplicated (already consumed)', async () => {
    eventsServiceMock.recordDomainEvent.mockResolvedValue({
      recorded: false,
      reason: 'ALREADY_CONSUMED',
    });

    const payload = {
      eventId: randomUUID(),
      serviceRequestId: randomUUID(),
    };

    await consumer.handleBidSubmitted(payload, contextMock);

    expect(channelMock.ack).toHaveBeenCalled();
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('should nack with requeue = true on transient database connection error (RabbitMQ retry)', async () => {
    const transientError = new Error('Connection terminated unexpectedly');
    eventsServiceMock.recordDomainEvent.mockRejectedValue(transientError);

    const payload = {
      eventId: randomUUID(),
      serviceRequestId: randomUUID(),
    };

    await consumer.handleOrderCreated(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true, // requeue = true for retry
    );
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should nack with requeue = true on ORDER_FLOW_NOT_READY to retry out-of-order events', async () => {
    const flowNotReadyError = new Error('ORDER_FLOW_NOT_READY: Flow not yet created for orderId 123');
    eventsServiceMock.recordDomainEvent.mockRejectedValue(flowNotReadyError);

    const payload = {
      eventId: randomUUID(),
      orderId: randomUUID(),
    };

    await consumer.handleOrderStatusChanged(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true, // requeue = true for retry when order.created arrives
    );
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should nack with requeue = true on Redis or Lock error when buffering pending events', async () => {
    const redisError = new Error('Redis is not connected');
    eventsServiceMock.recordDomainEvent.mockRejectedValue(redisError);

    const payload = {
      eventId: randomUUID(),
      orderId: randomUUID(),
    };

    await consumer.handleOrderStatusChanged(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true, // requeue = true for retry
    );
    expect(channelMock.ack).not.toHaveBeenCalled();
  });

  it('should nack with requeue = false on permanent error for DLQ forwarding', async () => {
    const permanentError = new Error('Invalid JSON structure');
    eventsServiceMock.recordDomainEvent.mockRejectedValue(permanentError);

    const payload = {
      eventId: randomUUID(),
      serviceRequestId: randomUUID(),
    };

    await consumer.handlePaymentSucceeded(payload, contextMock);

    expect(channelMock.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      false, // requeue = false -> routes to DLQ
    );
    expect(channelMock.ack).not.toHaveBeenCalled();
  });
});
