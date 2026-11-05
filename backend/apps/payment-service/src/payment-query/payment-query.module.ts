import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { PaymentQueryController } from './payment-query.controller.js';
import { PaymentQueryService } from './payment-query.service.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule],
  controllers: [PaymentQueryController],
  providers: [PaymentQueryService, JwtAuthGuard, TokenVerifierService],
  exports: [PaymentQueryService],
})
export class PaymentQueryModule {}
