import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from '@app/rabbitmq';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { CatalogOutboxRepository } from './outbox/catalog-outbox.repository.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Global()
@Module({
  imports: [RabbitMQModule, PrismaModule],
  providers: [
    CatalogOutboxRepository,
    {
      provide: OutboxRepository,
      useClass: CatalogOutboxRepository,
    },
    OutboxPublisherService,
  ],
  exports: [
    CatalogOutboxRepository,
    OutboxRepository,
    OutboxPublisherService,
  ],
})
export class CatalogCommonModule {}
