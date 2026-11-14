import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import { CommissionRulesAdminService } from './commission-rules-admin.service.js';
import { CreateCommissionRuleDto } from './dto/commission-rules.dto.js';

@ApiTags('Payment admin - commission rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments/admin/commission-rules')
export class CommissionRulesAdminController {
  constructor(private readonly service: CommissionRulesAdminService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: PaymentPaginationDto,
  ) {
    requireAdminPermission(user, PAYMENT_PERMISSIONS.commissionManage);
    return buildSuccessResponse(
      await this.service.list(query),
      'Commission rules retrieved',
    );
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateCommissionRuleDto,
  ) {
    const actor = requireAdminPermission(
      user,
      PAYMENT_PERMISSIONS.commissionManage,
    );
    return buildSuccessResponse(
      await this.service.create(actor, dto),
      'Commission rule created',
    );
  }
}
