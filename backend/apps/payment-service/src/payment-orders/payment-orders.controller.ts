import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { requireUserId } from '../common/auth/require-user-id.js';
import {
  CreatePaymentDto,
  PayWithPointsDto,
} from './dto/payment-orders.dto.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentOrdersController {
  constructor(private readonly service: PaymentOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Khởi tạo phương thức thanh toán cho đơn hàng',
    description:
      'Khách hàng (Customer) lựa chọn phương thức thanh toán (cash hoặc point) cho đơn hàng đã hoàn tất công việc.',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Lựa chọn phương thức thanh toán thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc đơn hàng chưa sẵn sàng thanh toán',
  })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  async open(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreatePaymentDto,
  ) {
    return buildSuccessResponse(
      await this.service.open(requireUserId(user), dto),
      'Payment method selected',
    );
  }

  @Post(':id/confirm-cash')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Thợ xác nhận đã nhận thanh toán bằng tiền mặt',
    description:
      'Chỉ Thợ (Worker) được giao thực hiện đơn hàng mới có quyền gọi API này để xác nhận đã nhận tiền mặt từ khách hàng.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của giao dịch thanh toán (paymentId)',
    example: '185e13db-2aca-4305-a249-e1fe937a4a12',
  })
  @ApiResponse({
    status: 200,
    description: 'Xác nhận thanh toán tiền mặt thành công',
  })
  @ApiResponse({
    status: 403,
    description:
      'Người gọi không phải thợ của đơn hoặc giao dịch không ở trạng thái hợp lệ',
  })
  async confirmCash(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.confirmCash(requireUserId(user), id),
      'Cash payment confirmed',
    );
  }

  @Post(':id/pay-with-points')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Khách hàng xác nhận thanh toán bằng Point',
    description:
      'Khách hàng chủ động xác nhận trừ Point trong ví HandyGo để hoàn tất thanh toán đơn hàng. Yêu cầu confirm=true.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của giao dịch thanh toán (paymentId)',
    example: '185e13db-2aca-4305-a249-e1fe937a4a12',
  })
  @ApiBody({ type: PayWithPointsDto })
  @ApiResponse({ status: 200, description: 'Thanh toán bằng Point thành công' })
  @ApiResponse({
    status: 400,
    description: 'Số dư Point không đủ hoặc chưa xác nhận confirm=true',
  })
  @ApiResponse({
    status: 403,
    description: 'Người gọi không phải khách hàng của đơn',
  })
  async payWithPoints(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: PayWithPointsDto,
  ) {
    return buildSuccessResponse(
      await this.service.payWithPoints(requireUserId(user), id),
      'Point payment processed',
    );
  }
}
