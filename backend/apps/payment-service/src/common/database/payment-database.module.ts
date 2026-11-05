import { Global, Module } from '@nestjs/common';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { PaymentPrismaService } from './payment-prisma.service.js';
import { PaymentOutboxRepository } from '../outbox/payment-outbox.repository.js';
import { PaymentOutboxService } from '../outbox/payment-outbox.service.js';

@Global()
@Module({
  providers: [
    PaymentPrismaService,
    PaymentOutboxService,
    { provide: OutboxRepository, useClass: PaymentOutboxRepository },
    OutboxPublisherService,
  ],
  exports: [PaymentPrismaService, PaymentOutboxService],
})
export class PaymentDatabaseModule {}
