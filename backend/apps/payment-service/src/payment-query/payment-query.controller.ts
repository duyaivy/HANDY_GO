import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { isUUID } from 'class-validator';
import {
  PaymentPaginationDto,
  PaymentQueryDto,
} from './dto/payment-query.dto.js';
import { PaymentQueryService } from './payment-query.service.js';
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentQueryController {
  constructor(private readonly service: PaymentQueryService) {}

  private userId(user: AuthenticatedUser | undefined): string {
    if (!user || !isUUID(user.userId))
      throw new UnauthorizedException('A valid authenticated user is required');
    return user.userId;
  }

  @Get('me')
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: PaymentQueryDto,
  ) {
    return buildSuccessResponse(
      await this.service.list(this.userId(user), query),
      'Payments retrieved',
    );
  }

  @Get('admin/records')
  async adminList(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: PaymentQueryDto,
  ) {
    const actor = requireAdminPermission(user, PAYMENT_PERMISSIONS.readAll);
    return buildSuccessResponse(
      await this.service.list(actor, query, true),
      'Payments retrieved',
    );
  }

  @Get('admin/records/:id')
  async adminById(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = requireAdminPermission(user, PAYMENT_PERMISSIONS.readAll);
    return buildSuccessResponse(
      await this.service.findById(id, actor, true),
      'Payment retrieved',
    );
  }

  @Get('order/:orderId')
  async byOrder(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return buildSuccessResponse(
      await this.service.findByOrder(orderId, this.userId(user)),
      'Payment retrieved',
    );
  }

  @Get(':id/attempts')
  async attempts(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaymentPaginationDto,
  ) {
    return buildSuccessResponse(
      await this.service.listAttempts(id, this.userId(user), query),
      'Payment attempts retrieved',
    );
  }

  @Get(':id')
  async byId(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.findById(id, this.userId(user)),
      'Payment retrieved',
    );
  }
}
