import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from '@app/rabbitmq';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrderOutboxRepository } from './outbox/order-outbox.repository.js';
import { OrderOutboxPublisherService } from './outbox/order-outbox-publisher.service.js';
import { ConsumedEventRepository } from './inbox/consumed-event.repository.js';

@Global()
@Module({
  imports: [RabbitMQModule, PrismaModule],
  providers: [
    OrderOutboxRepository,
    {
      provide: OutboxRepository,
      useClass: OrderOutboxRepository,
    },
    ConsumedEventRepository,
    OutboxPublisherService,
    OrderOutboxPublisherService,
  ],
  exports: [
    PrismaModule,
    OrderOutboxRepository,
    OutboxRepository,
    ConsumedEventRepository,
    OutboxPublisherService,
    OrderOutboxPublisherService,
  ],
})
export class OrderCommonModule {}
