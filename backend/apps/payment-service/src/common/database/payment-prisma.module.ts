import { Module } from '@nestjs/common';
import { PaymentPrismaService } from './payment-prisma.service.js';

@Module({
  providers: [PaymentPrismaService],
  exports: [PaymentPrismaService],
})
export class PaymentPrismaModule {}
