import { Module } from '@nestjs/common';
import { CommissionRuleService } from './commission-rule.service.js';

@Module({
  providers: [CommissionRuleService],
  exports: [CommissionRuleService],
})
export class CommissionRulesModule {}
