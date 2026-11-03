import { Body, Controller, Get, Headers, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WithdrawalService } from './withdrawal.service.js';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
import { WithdrawalClaimDto, WithdrawalStatusDto } from './dto/withdrawal-status.dto.js';

function serializeWithdrawal<T extends { amount: bigint }>(item: T): Omit<T, 'amount'> & { amount: string } {
  return { ...item, amount: item.amount.toString() };
}

function serializeWithdrawals<T extends { amount: bigint }>(items: T[]) {
  return items.map(serializeWithdrawal);
}

@ApiTags('Wallet Withdrawals')
@Controller()
export class WithdrawalController {
  constructor(private readonly service: WithdrawalService, private readonly config: ConfigService) {}

  /** Withdrawal tắt mặc định cho tới khi Payment/payout provider sẵn sàng; chỉ bật khi WALLET_WITHDRAWALS_ENABLED=true. */
  private assertWithdrawalsEnabled() {
    if (this.config.get('WALLET_WITHDRAWALS_ENABLED') !== 'true') {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODES.DEPENDENCY_UNAVAILABLE, 'Withdrawals are not available yet');
    }
  }

  @Post('wallets/me/withdrawals')
  async create(@Headers('x-internal-secret') s: string|undefined, @Headers('x-user-id') u: string|undefined, @Body() dto: CreateWithdrawalDto) {
    this.trusted(s);
    if (!u) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'User identity required');
    this.assertWithdrawalsEnabled();
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
  async payoutStatus(@Headers('x-internal-secret') s: string|undefined, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawalStatusDto) {
    this.trusted(s);
    return buildSuccessResponse(serializeWithdrawal(await this.service.finish(id, dto)), 'Withdrawal status updated');
  }

  @Post('internal/withdrawals/:id/claim')
  async claim(@Headers('x-internal-secret') s: string|undefined, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawalClaimDto) {
    this.trusted(s);
    return buildSuccessResponse(serializeWithdrawal(await this.service.claim(id, dto)), 'Withdrawal claimed for payout');
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
