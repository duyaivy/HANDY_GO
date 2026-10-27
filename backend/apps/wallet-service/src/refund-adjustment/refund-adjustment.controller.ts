import { Body, Controller, Headers, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { RefundAdjustmentService } from './refund-adjustment.service.js';
import { RefundCreditDto } from './dto/refund-credit.dto.js';
import { WalletAdjustmentDto } from './dto/wallet-adjustment.dto.js';

@ApiTags('Wallet Refund and Adjustment')
@Controller('internal/wallets/:userId')
export class RefundAdjustmentController {
  constructor(private readonly service: RefundAdjustmentService, private readonly config: ConfigService) {}
  @Post('refund-credit') async refund(@Headers('x-internal-secret') secret: string | undefined, @Param('userId') userId: string, @Body() dto: RefundCreditDto) { this.assertTrusted(secret); return buildSuccessResponse(await this.service.refund(userId, dto), 'Refund credited'); }
  @Post('adjustments') async adjust(@Headers('x-internal-secret') secret: string | undefined, @Headers('x-user-roles') roles: string | undefined, @Headers('x-user-id') actorId: string | undefined, @Param('userId') userId: string, @Body() dto: WalletAdjustmentDto) { this.assertTrusted(secret); if (!(roles ?? '').split(',').some((role) => role.trim().toLowerCase() === 'admin')) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Admin role required'); if (!actorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId.trim())) { throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Actor identity required for adjustment'); } return buildSuccessResponse(await this.service.adjust(userId, dto, actorId.trim()), 'Wallet adjusted'); }
  private assertTrusted(secret?: string) { const expected = this.config.internalServiceSecret; if (!expected || !secret || secret.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Trusted service authentication required'); }
}
