import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';
import { requireUserId } from '../common/auth/require-user-id.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import { CreateRefundDto, DecideRefundDto } from './dto/refunds.dto.js';
import { RefundsService } from './refunds.service.js';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class RefundsController {
  constructor(private readonly service: RefundsService) {}

  @Post(':id/refunds')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return buildSuccessResponse(
      await this.service.create(requireUserId(user), id, dto),
      'Refund requested',
    );
  }

  @Get(':id/refunds')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaymentPaginationDto,
  ) {
    return buildSuccessResponse(
      await this.service.list(requireUserId(user), id, query),
      'Refunds retrieved',
    );
  }

  @Post('admin/:id/refunds')
  async adminCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return buildSuccessResponse(
      await this.service.create(
        requireAdminPermission(user, PAYMENT_PERMISSIONS.refundCreate),
        id,
        dto,
        true,
      ),
      'Refund requested',
    );
  }

  @Get('admin/:id/refunds')
  async adminList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaymentPaginationDto,
  ) {
    return buildSuccessResponse(
      await this.service.list(
        requireAdminPermission(user, PAYMENT_PERMISSIONS.refundReadAll),
        id,
        query,
        true,
      ),
      'Refunds retrieved',
    );
  }

  @Post('admin/refunds/:id/decision')
  async decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRefundDto,
  ) {
    return buildSuccessResponse(
      await this.service.decide(
        requireAdminPermission(user, PAYMENT_PERMISSIONS.refundApprove),
        id,
        dto,
      ),
      'Refund decision recorded',
    );
  }
}
