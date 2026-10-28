import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from '@app/rabbitmq';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { BiddingOutboxRepository } from './outbox/bidding-outbox.repository.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Global()
@Module({
  imports: [RabbitMQModule, PrismaModule],
  providers: [
    BiddingOutboxRepository,
    {
      provide: OutboxRepository,
      useClass: BiddingOutboxRepository,
    },
    OutboxPublisherService,
  ],
  exports: [
    BiddingOutboxRepository,
    OutboxRepository,
    OutboxPublisherService,
  ],
})
export class BiddingCommonModule {}
