import {
  Controller, Get, Headers, HttpStatus, Ip, Param, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { buildSuccessResponse, AppException, ERROR_CODES } from '@app/common';
import { WalletQueryService } from './wallet-query.service.js';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto.js';
import { WalletResponseDto } from './dto/wallet-response.dto.js';
import { PaginatedWalletTransactionsResponseDto, WalletTransactionResponseDto } from './dto/wallet-transaction-response.dto.js';
import type { Request } from 'express';
import crypto from 'node:crypto';
import { resolveClientIp } from '../common/utils/client-ip.util.js';

@ApiTags('Wallet Query')
@ApiBearerAuth()
@Controller()
export class WalletQueryController {
  constructor(private readonly service: WalletQueryService, private readonly config: ConfigService) {}

  @Get('wallets/me')
  @ApiOperation({ summary: 'Get current user wallet' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getMyWallet(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Req() req: Request,
    @Ip() clientIp: string,
  ) {
    this.assertGateway(secret);
    resolveClientIp(this.config, req, clientIp);
    this.assertOwnerOrAdmin(userId, userId ?? '', roles);
    return buildSuccessResponse(await this.service.getWallet(userId ?? ''), 'Wallet retrieved');
  }

  @Get('wallets/me/transactions')
  @ApiOperation({ summary: 'List current user wallet transactions' })
  @ApiResponse({ status: 200, type: PaginatedWalletTransactionsResponseDto })
  async getMyTransactions(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Query() query: WalletTransactionQueryDto,
    @Req() req: Request,
    @Ip() clientIp: string,
  ) {
    this.assertGateway(secret);
    resolveClientIp(this.config, req, clientIp);
    this.assertOwnerOrAdmin(userId, userId ?? '', roles);
    return buildSuccessResponse(await this.service.getTransactions(userId ?? '', query), 'Wallet transactions retrieved');
  }

  @Get('wallets/me/transactions/:id')
  @ApiOperation({ summary: 'Get a current user wallet transaction' })
  @ApiResponse({ status: 200, type: WalletTransactionResponseDto })
  async getMyTransaction(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Param('id') transactionId: string,
    @Req() req: Request,
    @Ip() clientIp: string,
  ) {
    this.assertGateway(secret);
    resolveClientIp(this.config, req, clientIp);
    this.assertOwnerOrAdmin(userId, userId ?? '', roles);
    return buildSuccessResponse(await this.service.getTransaction(userId ?? '', transactionId), 'Wallet transaction retrieved');
  }

  @Get('internal/wallets/:userId/balance')
  @ApiOperation({ summary: 'Get a wallet balance for a trusted internal service' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getInternalBalance(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('userId') userId: string,
    @Req() req: Request,
    @Ip() clientIp: string,
  ) {
    this.assertGateway(secret);
    resolveClientIp(this.config, req, clientIp);
    return buildSuccessResponse(await this.service.getInternalBalance(userId), 'Wallet balance retrieved');
  }

  private assertGateway(secret: string | undefined): void {
    const expected = this.config.internalServiceSecret;
    const valid = !!expected && !!secret && secret.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
    if (!valid) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Request must originate from the trusted API Gateway');
  }

  private assertOwnerOrAdmin(userId: string | undefined, targetUserId: string, roles: string | undefined): void {
    if (!userId) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Authenticated user identity is required');
    const isAdmin = (roles ?? '').split(',').some((role) => role.trim().toLowerCase() === 'admin');
    if (!isAdmin && userId !== targetUserId) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Cannot access another user wallet');
  }
}
