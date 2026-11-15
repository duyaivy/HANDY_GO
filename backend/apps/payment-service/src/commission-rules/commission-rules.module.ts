import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, TokenVerifierService } from '@app/auth';
import { PaymentPrismaModule } from '../common/database/payment-prisma.module.js';
import { CommissionRulesAdminController } from './commission-rules-admin.controller.js';
import { CommissionRulesAdminService } from './commission-rules-admin.service.js';
import { CommissionRuleService } from './commission-rule.service.js';

@Module({
  imports: [JwtModule.register({}), PaymentPrismaModule],
  controllers: [CommissionRulesAdminController],
  providers: [
    CommissionRuleService,
    CommissionRulesAdminService,
    JwtAuthGuard,
    TokenVerifierService,
  ],
  exports: [CommissionRuleService],
})
export class CommissionRulesModule {}
