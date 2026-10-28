import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PaymentEventsConsumer } from './payment-events.consumer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';

describe('PaymentEventsConsumer', () => {
  let consumer: PaymentEventsConsumer;
  let prismaMock: {
    $transaction: ReturnType<typeof vi.fn>;
    order: {
      update: ReturnType<typeof vi.fn>;
    };
  };
  let consumedRepoMock: {
    recordEventIfNew: ReturnType<typeof vi.fn>;
  };
  let contextMock: {
    getChannelRef: ReturnType<typeof vi.fn>;
    getMessage: ReturnType<typeof vi.fn>;
  };
  let channelMock: {
    ack: ReturnType<typeof vi.fn>;
    nack: ReturnType<typeof vi.fn>;
  };
  const originalMsg = { fields: { deliveryTag: 1 } };

  const mockOrderId = '11111111-1111-1111-1111-111111111111';
  const mockEventId = 'evt-payment-1';

  beforeEach(() => {
    channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
    };
    contextMock = {
      getChannelRef: vi.fn().mockReturnValue(channelMock),
      getMessage: vi.fn().mockReturnValue(originalMsg),
    };

    prismaMock = {
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
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
    it('should update paymentState to paid when event is new within transaction and ACK after commit', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockResolvedValue({ id: mockOrderId, paymentState: 'paid' });

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentSucceeded(payload, contextMock);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(consumedRepoMock.recordEventIfNew).toHaveBeenCalledWith(
        mockEventId,
        ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED,
        prismaMock,
      );
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: { paymentState: 'paid' },
      });
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should skip duplicate payment.succeeded events and ACK message', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(false);

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentSucceeded(payload, contextMock);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should reject without requeue when eventId is missing', async () => {
      const payload = {
        orderId: mockOrderId,
      };

      await consumer.handlePaymentSucceeded(payload, contextMock);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, false);
      expect(channelMock.ack).not.toHaveBeenCalled();
    });

    it('should reject without requeue when orderId is missing', async () => {
      const payload = {
        eventId: mockEventId,
      };

      await consumer.handlePaymentSucceeded(payload, contextMock);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, false);
      expect(channelMock.ack).not.toHaveBeenCalled();
    });

    it('should rollback transaction and NACK with requeue when DB operation fails', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockRejectedValue(new Error('DB connection dead'));

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await expect(consumer.handlePaymentSucceeded(payload, contextMock)).rejects.toThrow(
        'DB connection dead',
      );

      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, true);
      expect(channelMock.ack).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentFailed', () => {
    it('should update paymentState to failed when event is new within transaction and ACK after commit', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockResolvedValue({ id: mockOrderId, paymentState: 'failed' });

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentFailed(payload, contextMock);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(consumedRepoMock.recordEventIfNew).toHaveBeenCalledWith(
        mockEventId,
        ORDER_CONSTANTS.EVENT_PAYMENT_FAILED,
        prismaMock,
      );
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: { paymentState: 'failed' },
      });
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should skip duplicate payment.failed events and ACK message', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(false);

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await consumer.handlePaymentFailed(payload, contextMock);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should reject without requeue when eventId is missing', async () => {
      const payload = {
        orderId: mockOrderId,
      };

      await consumer.handlePaymentFailed(payload, contextMock);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, false);
      expect(channelMock.ack).not.toHaveBeenCalled();
    });

    it('should rollback transaction and NACK with requeue when DB operation fails', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockRejectedValue(new Error('Deadlock detected'));

      const payload = {
        eventId: mockEventId,
        orderId: mockOrderId,
      };

      await expect(consumer.handlePaymentFailed(payload, contextMock)).rejects.toThrow(
        'Deadlock detected',
      );

      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, true);
      expect(channelMock.ack).not.toHaveBeenCalled();
    });
  });
});
