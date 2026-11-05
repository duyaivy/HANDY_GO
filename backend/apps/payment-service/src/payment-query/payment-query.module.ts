import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { PaymentQueryController } from './payment-query.controller.js';
import { PaymentQueryService } from './payment-query.service.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PaymentQueryController],
  providers: [PaymentPrismaService, PaymentQueryService, JwtAuthGuard, TokenVerifierService],
})
export class PaymentQueryModule {}
