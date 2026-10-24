import { Controller, Get } from '@nestjs/common';
import { TopupSettlementService } from './topup-settlement.service.js';
@Controller('internal/wallets/topups')
export class TopupSettlementController {
  constructor(private readonly service: TopupSettlementService) {}
  @Get('health') status() { return { enabled: true }; }
}
