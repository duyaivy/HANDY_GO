import { Body, Controller, Get, Headers, HttpStatus, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import { resolveClientIp } from '../common/utils/client-ip.util.js';
import type { Request } from 'express';
import crypto from 'node:crypto';
import { PaymentDebitService } from './payment-debit.service.js';
import { DebitPaymentDto } from './dto/debit-payment.dto.js';

@ApiTags('Wallet Internal Payment Debit')
@Controller('internal/wallets')
export class PaymentDebitController {
  constructor(private readonly service: PaymentDebitService, private readonly config: ConfigService) {}
  @Post(':userId/debit-payment')
  @ApiOperation({ summary: 'Atomically debit a customer payment and credit recipients' })
  async debit(@Headers('x-internal-secret') secret: string | undefined, @Param('userId') customerId: string, @Body() dto: DebitPaymentDto, @Req() req: Request, @Ip() ip: string) {
    this.assertTrusted(secret); resolveClientIp(this.config, req, ip);
    return buildSuccessResponse(await this.service.debit(customerId, dto), 'Payment debited');
  }
  @Get('operations/:operationId')
  async status(@Headers('x-internal-secret') secret: string | undefined, @Req() req: Request, @Ip() ip: string, @Param('operationId') id: string) {
    this.assertTrusted(secret); resolveClientIp(this.config, req, ip);
    return buildSuccessResponse(await this.service.getStatus(id), 'Payment operation status retrieved');
  }
  private assertTrusted(secret?: string) {
    const expected = this.config.internalServiceSecret;
    if (!expected || !secret || secret.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Request must originate from a trusted service');
  }
}
