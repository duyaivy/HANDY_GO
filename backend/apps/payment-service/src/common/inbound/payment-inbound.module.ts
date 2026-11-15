import { Global, Module } from '@nestjs/common';
import { PaymentPrismaModule } from '../database/payment-prisma.module.js';
import { PaymentInboxService } from './payment-inbox.service.js';

@Global()
@Module({
  imports: [PaymentPrismaModule],
  providers: [PaymentInboxService],
  exports: [PaymentInboxService],
})
export class PaymentInboundModule {}
