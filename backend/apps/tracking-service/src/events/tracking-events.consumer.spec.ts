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
