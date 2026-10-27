import { Body, Controller, Get, Headers, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WithdrawalService } from './withdrawal.service.js';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
import { WithdrawalStatusDto } from './dto/withdrawal-status.dto.js';

function serializeWithdrawal<T extends { amount: bigint }>(item: T): Omit<T, 'amount'> & { amount: string } {
  return { ...item, amount: item.amount.toString() };
}

function serializeWithdrawals<T extends { amount: bigint }>(items: T[]) {
  return items.map(serializeWithdrawal);
}

@Controller()
export class WithdrawalController {
  constructor(private readonly service: WithdrawalService, private readonly config: ConfigService) {}

  @Post('wallets/me/withdrawals')
  async create(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Body() dto: CreateWithdrawalDto) {
    this.trusted(s);
    if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required');
    return buildSuccessResponse(serializeWithdrawal(await this.service.create(u, dto)), 'Withdrawal requested');
  }

  @Get('wallets/me/withdrawals')
  async list(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Query('page') page = '1', @Query('limit') limit = '20') {
    this.trusted(s);
    if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required');
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedPage) || parsedPage < 1 || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'page must be >= 1 and limit must be between 1 and 100');
    }
    return buildSuccessResponse(
      serializeWithdrawals(await this.service.list(u, (parsedPage - 1) * parsedLimit, parsedLimit)),
      'Withdrawals retrieved',
    );
  }

  @Get('wallets/me/withdrawals/:id')
  async get(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Param('id') id: string) {
    this.trusted(s);
    if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required');
    return buildSuccessResponse(serializeWithdrawal(await this.service.get(u, id)), 'Withdrawal retrieved');
  }

  @Post('wallets/me/withdrawals/:id/cancel')
  async cancel(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Param('id') id: string) {
    this.trusted(s);
    if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required');
    return buildSuccessResponse(serializeWithdrawal(await this.service.cancel(u, id)), 'Withdrawal cancelled');
  }

  @Post('internal/withdrawals/:id/status')
  async payoutStatus(@Headers('x-internal-secret') s: string|undefined, @Param('id') id: string, @Body() dto: WithdrawalStatusDto) {
    this.trusted(s);
    const withdrawal = await this.service.getById(id);
    return buildSuccessResponse(serializeWithdrawal(await this.service.finish(withdrawal.userId, id, dto.status)), 'Withdrawal status updated');
  }

  @Post('internal/withdrawals/:id/mark-processing')
  async markProcessing(@Headers('x-internal-secret') s: string|undefined, @Param('id') id: string) {
    this.trusted(s);
    return buildSuccessResponse(serializeWithdrawal(await this.service.markProcessing(id)), 'Withdrawal marked as processing');
  }

  private trusted(s?: string) {
    const expected = this.config.internalServiceSecret;
    if (!expected || !s) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Trusted service authentication required');
    const suppliedBuffer = Buffer.from(s);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Trusted service authentication required');
    }
  }
}
