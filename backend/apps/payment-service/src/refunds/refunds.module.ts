import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule],
  controllers: [RefundsController],
  providers: [RefundsService, JwtAuthGuard, TokenVerifierService],
})
export class RefundsModule {}
