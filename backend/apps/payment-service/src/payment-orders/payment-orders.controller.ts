import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { requireUserId } from '../common/auth/require-user-id.js';
import { CreatePaymentDto, PayWithPointsDto } from './dto/payment-orders.dto.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentOrdersController {
  constructor(private readonly service: PaymentOrdersService) {}

  @Post()
  async open(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreatePaymentDto) {
    return buildSuccessResponse(await this.service.open(requireUserId(user), dto), 'Payment method selected');
  }

  @Post(':id/confirm-cash')
  @HttpCode(200)
  async confirmCash(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return buildSuccessResponse(await this.service.confirmCash(requireUserId(user), id), 'Cash payment confirmed');
  }

  @Post(':id/pay-with-points')
  @HttpCode(200)
  async payWithPoints(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: PayWithPointsDto,
  ) {
    return buildSuccessResponse(await this.service.payWithPoints(requireUserId(user), id), 'Point payment processed');
  }
}
