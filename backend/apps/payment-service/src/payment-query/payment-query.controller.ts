import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Lấy danh sách giao dịch thanh toán của người dùng hiện tại',
    description:
      'Trả về danh sách thanh toán mà người dùng đang đăng nhập là Customer (người trả) hoặc Worker (người nhận). Hỗ trợ lọc theo trạng thái và phân trang.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách thanh toán thành công',
  })
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
  @ApiOperation({
    summary: 'Admin xem danh sách toàn bộ giao dịch thanh toán',
    description:
      'Dành cho Admin tra cứu tất cả các đơn thanh toán trên hệ thống. Hỗ trợ lọc theo nhiều trạng thái (status), phương thức (cash/point) và phân trang. Yêu cầu quyền payment:read:all.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách thanh toán thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền payment:read:all' })
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
  @ApiOperation({
    summary: 'Admin xem chi tiết một giao dịch thanh toán',
    description:
      'Dành cho Admin xem đầy đủ thông tin giao dịch thanh toán gồm phí sàn, thu nhập thợ, trạng thái thanh toán theo paymentId. Yêu cầu quyền payment:read:all.',
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
    description: 'Lấy chi tiết thanh toán thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền payment:read:all' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy thanh toán' })
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
  @ApiOperation({
    summary: 'Tra cứu thông tin thanh toán theo mã đơn hàng (orderId)',
    description:
      'Customer hoặc Worker liên quan đến đơn hàng tra cứu thông tin thanh toán theo orderId.',
  })
  @ApiParam({
    name: 'orderId',
    type: String,
    format: 'uuid',
    description: 'ID của đơn hàng (orderId)',
    example: '7f8b9c1d-1234-4567-89ab-cdef01234567',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy thông tin thanh toán thành công',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy giao dịch thanh toán cho đơn hàng này',
  })
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
  @ApiOperation({
    summary: 'Lấy danh sách các lần thử thanh toán của giao dịch',
    description:
      'Người dùng liên quan xem lịch sử các lần thử thanh toán (attempts) theo paymentId, sắp xếp theo số lần thử mới nhất.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của giao dịch thanh toán (paymentId)',
    example: '185e13db-2aca-4305-a249-e1fe937a4a12',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách attempt thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy thanh toán' })
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
  @ApiOperation({
    summary: 'Người dùng xem chi tiết giao dịch thanh toán của mình',
    description:
      'Customer hoặc Worker của đơn hàng xem thông tin chi tiết thanh toán theo paymentId.',
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
    description: 'Lấy chi tiết thanh toán thành công',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy thanh toán' })
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
