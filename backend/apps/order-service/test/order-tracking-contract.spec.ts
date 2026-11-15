import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  EVENT_PATTERNS,
  type OrderCreatedPayload,
  type OrderStatusChangedPayload,
  type ServiceRequestBiddingClosedPayload,
} from '@app/common';
import { ORDER_CONSTANTS } from '../src/common/constants/order.constants.js';
import { OrderOutboxPublisherService } from '../src/common/outbox/order-outbox-publisher.service.js';

describe('Order → Tracking event contract', () => {
  const publisher = new OrderOutboxPublisherService({} as any, {} as any);
  const requestId = randomUUID(), orderId = randomUUID();
  const customerId = randomUUID(), workerId = randomUUID();
  const now = '2026-11-11T00:00:00.000Z';

  const cases = [
    {
      pattern: EVENT_PATTERNS.ORDER_CREATED,
      orderConstant: ORDER_CONSTANTS.EVENT_ORDER_CREATED,
      payload: {
        orderId, orderCode: 'ORD-HG64', serviceRequestId: requestId, requestId,
        bookingProposalId: randomUUID(), customerUserId: customerId, customerId,
        workerUserId: workerId, workerId, selectionSource: 'bid',
        selectedBidId: randomUUID(), selectedMatchResultId: null,
        serviceId: randomUUID(), agreedPrice: '300000', currency: 'VND',
        scheduledAt: now, addressText: '123 Test Street', latitude: 16.07,
        longitude: 108.15, createdAt: now,
      } satisfies OrderCreatedPayload,
    },
    {
      pattern: EVENT_PATTERNS.ORDER_STATUS_CHANGED,
      orderConstant: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
      payload: {
        orderId, customerId, customerUserId: customerId, workerId,
        workerUserId: workerId, previousStatus: 'created', nextStatus: 'confirmed',
        notificationKind: 'status_update', confirmedAt: now,
      } satisfies OrderStatusChangedPayload,
    },
    {
      pattern: EVENT_PATTERNS.SERVICE_REQUEST_BIDDING_CLOSED,
      orderConstant: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_BIDDING_CLOSED,
      payload: {
        serviceRequestId: requestId, requestId, requestCode: 'REQ-HG64',
        customerUserId: customerId, biddingClosedAt: now,
      } satisfies ServiceRequestBiddingClosedPayload,
    },
  ];

  it.each(cases)('publishes $pattern with one shared name and intact payload', ({ pattern, orderConstant, payload }) => {
    const eventId = randomUUID();
    const envelope = publisher.buildEnvelope({ id: eventId, eventType: orderConstant, payload, createdAt: now });
    expect(orderConstant).toBe(pattern);
    expect(envelope).toMatchObject({
      eventId,
      eventType: pattern,
      eventVersion: 1,
      source: 'order-service',
      occurredAt: now,
      payload,
      data: payload,
    });
    expect(envelope.payload).toEqual(payload);
  });
});
