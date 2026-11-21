import { OutboxPublisherService } from '@app/common';
import { RabbitMQService } from '@app/rabbitmq';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderCommonModule } from './order-common.module.js';
import { OrderOutboxPublisherService } from './outbox/order-outbox-publisher.service.js';

describe('OrderCommonModule', () => {
  it('resolves both publisher tokens to the same Order outbox publisher', async () => {
    const module = await Test.createTestingModule({
      imports: [OrderCommonModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RabbitMQService)
      .useValue({})
      .compile();

    try {
      expect(module.get(OutboxPublisherService)).toBe(
        module.get(OrderOutboxPublisherService),
      );
    } finally {
      await module.close();
    }
  });
});
