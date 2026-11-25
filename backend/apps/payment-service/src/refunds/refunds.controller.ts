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
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';
import { requireUserId } from '../common/auth/require-user-id.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import {
  AdminRefundQueryDto,
  CreateRefundDto,
  DecideRefundDto,
} from './dto/refunds.dto.js';
import { RefundsService } from './refunds.service.js';

@ApiTags('Refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class RefundsController {
  constructor(private readonly service: RefundsService) {}

  @Get('admin/refunds')
  @ApiOperation({
    summary: 'Admin xem danh sách toàn bộ yêu cầu hoàn tiền trên hệ thống',
    description:
      'Dành cho Admin xem tất cả các yêu cầu hoàn tiền từ khách hàng hoặc admin khác tạo. Hỗ trợ lọc theo nhiều trạng thái (status), mã thanh toán (paymentId) và phân trang. Yêu cầu quyền refund:read:all.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách yêu cầu hoàn tiền thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền refund:read:all' })
  async adminListAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminRefundQueryDto,
  ) {
    return buildSuccessResponse(
      await this.service.listAll(
        requireAdminPermission(user, PAYMENT_PERMISSIONS.refundReadAll),
        query,
      ),
      'Refunds retrieved',
    );
  }

  @Post(':id/refunds')
  @ApiOperation({
    summary: 'Khách hàng tạo yêu cầu hoàn tiền cho đơn thanh toán',
    description:
      'Chỉ Khách hàng (Customer) của đơn thanh toán mới có quyền yêu cầu hoàn tiền. Cần cung cấp số tiền hoàn (toàn bộ hoặc một phần), lý do và khóa chống lặp idempotencyKey.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của giao dịch thanh toán (paymentId)',
    example: '185e13db-2aca-4305-a249-e1fe937a4a12',
  })
  @ApiBody({ type: CreateRefundDto })
  @ApiResponse({ status: 201, description: 'Gửi yêu cầu hoàn tiền thành công' })
  @ApiResponse({
    status: 400,
    description: 'Số tiền hoặc dữ liệu yêu cầu không hợp lệ',
  })
  @ApiResponse({
    status: 403,
    description: 'Người dùng không phải chủ đơn thanh toán',
  })
  @ApiResponse({
    status: 409,
    description:
      'Trùng lặp idempotencyKey với số tiền/lý do khác hoặc vượt quá số tiền thanh toán',
  })
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
  @ApiOperation({
    summary: 'Khách hàng xem các yêu cầu hoàn tiền của đơn thanh toán',
    description:
      'Khách hàng xem danh sách các đợt hoàn tiền thuộc đơn thanh toán của mình theo paymentId.',
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
    description: 'Lấy danh sách hoàn tiền thành công',
  })
  @ApiResponse({
    status: 403,
    description: 'Người dùng không phải chủ đơn thanh toán',
  })
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
  @ApiOperation({
    summary: 'Admin khởi tạo yêu cầu hoàn tiền cho đơn thanh toán',
    description:
      'Admin có quyền refund:create tạo yêu cầu hoàn tiền cho khách hàng khi giải quyết khiếu nại/tranh chấp. Yêu cầu quyền refund:create.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của giao dịch thanh toán (paymentId)',
    example: '185e13db-2aca-4305-a249-e1fe937a4a12',
  })
  @ApiBody({ type: CreateRefundDto })
  @ApiResponse({
    status: 201,
    description: 'Khởi tạo yêu cầu hoàn tiền thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền refund:create' })
  @ApiResponse({
    status: 409,
    description:
      'Số tiền hoàn vượt quá giá trị đơn hoặc xung đột idempotencyKey',
  })
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
  @ApiOperation({
    summary: 'Admin xem danh sách các yêu cầu hoàn tiền của một đơn thanh toán',
    description:
      'Dành cho Admin tra cứu lịch sử hoàn tiền thuộc một giao dịch cụ thể theo paymentId. Yêu cầu quyền refund:read:all.',
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
    description: 'Lấy danh sách hoàn tiền thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền refund:read:all' })
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
  @ApiOperation({
    summary: 'Admin duyệt hoặc từ chối yêu cầu hoàn tiền',
    description:
      'Admin có quyền refund:approve thẩm định và đưa ra quyết định duyệt (approve=true) hoặc từ chối (approve=false). ' +
      'Quy tắc bảo mật: Admin không được tự duyệt yêu cầu do chính mình tạo ra hoặc đơn của chính mình. ' +
      'Khi duyệt thành công, hệ thống tự động gọi Wallet Service để cộng Point hoàn trả cho khách hàng (1 Point = 1 VND).',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của yêu cầu hoàn tiền (refundId)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: DecideRefundDto })
  @ApiResponse({
    status: 200,
    description: 'Ghi nhận quyết định phê duyệt/từ chối thành công',
  })
  @ApiResponse({
    status: 403,
    description:
      'Thiếu quyền refund:approve hoặc vi phạm quy tắc không tự duyệt',
  })
  @ApiResponse({
    status: 409,
    description: 'Yêu cầu hoàn tiền đã có quyết định trước đó',
  })
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
