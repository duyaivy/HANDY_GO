import { Global, Module } from '@nestjs/common';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { PaymentPrismaModule } from './payment-prisma.module.js';
import { PaymentOutboxRepository } from '../outbox/payment-outbox.repository.js';
import { PaymentOutboxService } from '../outbox/payment-outbox.service.js';

@Global()
@Module({
  imports: [PaymentPrismaModule],
  providers: [
    PaymentOutboxService,
    { provide: OutboxRepository, useClass: PaymentOutboxRepository },
    OutboxPublisherService,
  ],
  exports: [PaymentPrismaModule, PaymentOutboxService],
})
export class PaymentDatabaseModule {}
