import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PaymentEventsConsumer } from './payment-events.consumer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';

describe('PaymentEventsConsumer', () => {
  let consumer: PaymentEventsConsumer;
  let prismaMock: {
    order: {
      update: ReturnType<typeof vi.fn>;
    };
  };
  let consumedRepoMock: {
    recordEventIfNew: ReturnType<typeof vi.fn>;
  };

  const mockOrderId = '11111111-1111-1111-1111-111111111111';
  const mockEventId = 'evt-payment-1';

  beforeEach(() => {
    prismaMock = {
      order: {
        update: vi.fn(),
      },
    };
    consumedRepoMock = {
      recordEventIfNew: vi.fn(),
    };

    consumer = new PaymentEventsConsumer(
      prismaMock as unknown as PrismaService,
      consumedRepoMock as unknown as ConsumedEventRepository,
    );
  });

  describe('handlePaymentSucceeded', () => {
    it('should update paymentState to paid when event is new', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockResolvedValue({ id: mockOrderId, paymentState: 'paid' });

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentSucceeded(payload);

      expect(consumedRepoMock.recordEventIfNew).toHaveBeenCalledWith(
        mockEventId,
        ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED,
      );
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: { paymentState: 'paid' },
      });
    });

    it('should skip duplicate payment.succeeded events', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(false);

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentSucceeded(payload);

      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentFailed', () => {
    it('should update paymentState to failed when event is new', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockResolvedValue({ id: mockOrderId, paymentState: 'failed' });

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentFailed(payload);

      expect(consumedRepoMock.recordEventIfNew).toHaveBeenCalledWith(
        mockEventId,
        ORDER_CONSTANTS.EVENT_PAYMENT_FAILED,
      );
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: { paymentState: 'failed' },
      });
    });

    it('should skip duplicate payment.failed events', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(false);

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentFailed(payload);

      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });
  });
});
