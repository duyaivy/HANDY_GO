import { Body, Controller, Get, Headers, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import { assertTrustedSecret, requireAdminPermission, WALLET_PERMISSIONS } from '../common/utils/trusted-request.util.js';
import { RefundAdjustmentService } from './refund-adjustment.service.js';
import { RefundCreditDto } from './dto/refund-credit.dto.js';
import { WalletAdjustmentDto } from './dto/wallet-adjustment.dto.js';

@ApiTags('Wallet Refund and Adjustment')
@Controller('internal/wallets')
export class RefundAdjustmentController {
  constructor(private readonly service: RefundAdjustmentService, private readonly config: ConfigService) {}

  @Post(':userId/refund-credit')
  async refund(@Headers('x-internal-secret') secret: string | undefined, @Param('userId') userId: string, @Body() dto: RefundCreditDto) {
    assertTrustedSecret(this.config.internalServiceSecret, secret);
    return buildSuccessResponse(await this.service.refund(userId, dto), 'Refund credited');
  }

  /** Adjustment: Admin có permission wallet:adjust; luôn ghi audit. */
  @Post(':userId/adjustments')
  async adjust(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Headers('x-user-id') actorId: string | undefined,
    @Headers('x-user-permissions') permissions: string | undefined,
    @Param('userId') userId: string,
    @Body() dto: WalletAdjustmentDto,
  ) {
    assertTrustedSecret(this.config.internalServiceSecret, secret);
    const actor = requireAdminPermission(roles, actorId, permissions, WALLET_PERMISSIONS.adjust);
    return buildSuccessResponse(await this.service.adjust(userId, dto, actor), 'Wallet adjusted');
  }

  /** Đọc audit log: Admin có permission wallet:audit:read. */
  @Get(':userId/audit-logs')
  async auditLogs(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Headers('x-user-id') actorId: string | undefined,
    @Headers('x-user-permissions') permissions: string | undefined,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    assertTrustedSecret(this.config.internalServiceSecret, secret);
    requireAdminPermission(roles, actorId, permissions, WALLET_PERMISSIONS.auditRead);
    const p = Number(page);
    const l = Number(limit);
    if (!Number.isInteger(p) || p < 1 || !Number.isInteger(l) || l < 1 || l > 100) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'page must be >= 1 and limit must be between 1 and 100');
    }
    return buildSuccessResponse(await this.service.listAuditLogs(userId, (p - 1) * l, l), 'Audit logs retrieved');
  }
}
