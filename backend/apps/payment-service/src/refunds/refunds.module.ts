import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';
import { PaymentClientsModule } from '../common/clients/payment-clients.module.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule, PaymentClientsModule],
  controllers: [RefundsController],
  providers: [RefundsService, JwtAuthGuard, TokenVerifierService],
  exports: [RefundsService],
})
export class RefundsModule {}
