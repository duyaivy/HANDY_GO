import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { Equals, IsIn, IsString, Length } from 'class-validator';
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';
import { PayoutsService } from './payouts.service.js';

export class ResolveSandboxPayoutDto {
  @IsIn(['succeeded', 'failed']) status!: 'succeeded' | 'failed';
  @IsString() @Length(1, 500) reason!: string;
  @Equals(true) confirmSimulated!: true;
}

@Controller('payments/admin/operations/payouts')
@UseGuards(JwtAuthGuard)
export class PayoutAdminController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post(':id/resolve-sandbox')
  async resolve(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSandboxPayoutDto,
  ) {
    const actor = requireAdminPermission(user, PAYMENT_PERMISSIONS.reconcile);
    return buildSuccessResponse(
      await this.payouts.resolveSandbox(id, dto.status, actor, dto.reason),
      'Simulated payout resolution recorded',
    );
  }
}
