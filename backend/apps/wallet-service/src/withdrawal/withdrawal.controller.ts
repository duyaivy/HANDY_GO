import { Body, Controller, Get, Headers, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WithdrawalService } from './withdrawal.service.js';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
import { WithdrawalStatusDto } from './dto/withdrawal-status.dto.js';
@Controller()
export class WithdrawalController {
  constructor(private readonly service: WithdrawalService, private readonly config: ConfigService) {}
  @Post('wallets/me/withdrawals') async create(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Body() dto: CreateWithdrawalDto) { this.trusted(s); if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required'); return buildSuccessResponse(await this.service.create(u,dto),'Withdrawal requested'); }
  @Get('wallets/me/withdrawals') async list(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Query('page') page = '1', @Query('limit') limit = '20') { this.trusted(s); if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required'); return buildSuccessResponse(await this.service.list(u,(+page-1)*(+limit),+limit),'Withdrawals retrieved'); }
  @Get('wallets/me/withdrawals/:id') async get(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Param('id') id: string) { this.trusted(s); if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required'); return buildSuccessResponse(await this.service.get(u,id),'Withdrawal retrieved'); }
  @Post('wallets/me/withdrawals/:id/cancel') async cancel(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Param('id') id: string) { this.trusted(s); if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required'); return buildSuccessResponse(await this.service.cancel(u,id),'Withdrawal cancelled'); }
  @Post('internal/withdrawals/:id/status') async payoutStatus(@Headers('x-internal-secret') s: string|undefined, @Param('id') id: string, @Body() dto: WithdrawalStatusDto) { this.trusted(s); const withdrawal = await this.service.getById(id); return buildSuccessResponse(await this.service.finish(withdrawal.userId,id,dto.status),'Withdrawal status updated'); }
  private trusted(s?: string) { const e=this.config.internalServiceSecret; if(!e||!s||s.length!==e.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e))) throw new AppException(HttpStatus.FORBIDDEN,ERROR_CODES.FORBIDDEN,'Trusted service authentication required'); }
}
