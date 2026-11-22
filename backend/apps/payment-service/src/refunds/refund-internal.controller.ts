import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { buildSuccessResponse } from '@app/common';
import { ConfigService } from '@app/config';
import { RefundsService } from './refunds.service.js';

export class CancelDisputeRefundForOverrideDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  adminUserId!: string;

  @IsString()
  @Length(1, 2000)
  @Matches(/\S/)
  reason!: string;
}

@Controller('internal/payments')
export class RefundInternalController {
  constructor(
    private readonly config: ConfigService,
    private readonly refunds: RefundsService,
  ) {}

  @Post('dispute-resolutions/:resolutionId/cancel-for-override')
  @HttpCode(HttpStatus.OK)
  async cancelDisputeRefundForOverride(
    @Headers('x-internal-secret') provided: string | undefined,
    @Param('resolutionId', ParseUUIDPipe) resolutionId: string,
    @Body() dto: CancelDisputeRefundForOverrideDto,
  ) {
    const expected = this.config.internalServiceSecret;
    if (
      !expected ||
      !provided ||
      Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    ) {
      throw new ForbiddenException('Internal authentication required');
    }
    return buildSuccessResponse(
      await this.refunds.cancelDisputeRefundForOverride(resolutionId, {
        orderId: dto.orderId,
        adminUserId: dto.adminUserId,
        reason: dto.reason,
      }),
      'Dispute refund override check completed',
    );
  }
}
