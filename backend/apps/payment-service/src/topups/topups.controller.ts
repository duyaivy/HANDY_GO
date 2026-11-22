import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
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
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import type { Request } from 'express';
import { requireUserId } from '../common/auth/require-user-id.js';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import { CreateTopupDto } from './dto/create-topup.dto.js';
import { SimulateTopupDto } from './dto/simulate-topup.dto.js';
import {
  TopupsService,
  WALLET_TOPUP_CREDITED,
  type IpnResponse,
} from './topups.service.js';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : Array.isArray(forwarded) && forwarded[0]
        ? forwarded[0].trim()
        : '';
  const raw = (first || req.ip || '').replace(/^::ffff:/, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(raw) ? raw : '127.0.0.1';
}

// Provider callback: authenticated by the provider's signature, not by a user JWT.
@ApiTags('Payment top-ups')
@Controller('payments/topups')
export class TopupIpnController {
  constructor(private readonly service: TopupsService) {}

  @Get('vnpay/ipn')
  @ApiOperation({
    summary: 'VNPAY IPN webhook',
    description:
      'Xử lý webhook server-to-server từ cổng thanh toán VNPAY sau khi người dùng hoàn tất giao dịch. Xác thực chữ ký bí mật checksum để đảm bảo tính toàn vẹn dữ liệu và cập nhật trạng thái nạp tiền.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Phản hồi mã RspCode cho VNPAY (00: thành công, 97: sai chữ ký, 01: không tìm thấy đơn, 02: đã cập nhật trước đó).',
  })
  ipn(@Query() query: Record<string, string>): Promise<IpnResponse> {
    return this.service.handleIpn(query);
  }

  @Get('vnpay/return')
  @ApiOperation({
    summary: 'VNPAY return landing page',
    description:
      'Trang nhận điều hướng trình duyệt của người dùng sau khi giao dịch tại cổng VNPAY kết thúc. Đây là endpoint read-only dùng để hiển thị kết quả cho giao diện người dùng, không dùng để xác nhận cộng tiền (credit).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Thông tin hướng dẫn truy vấn trạng thái nạp tiền thông qua GET /payments/topups/:id sau khi đăng nhập.',
  })
  browserReturn() {
    // Public, read-only landing response. Browser parameters cannot settle a top-up.
    return buildSuccessResponse(
      {
        confirmed: false,
        statusEndpoint: 'GET /payments/topups/:id',
        authenticationRequired: true,
      },
      'Query your top-up status after signing in; the browser return does not confirm credit',
    );
  }
}

@ApiTags('Payment top-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments/topups')
export class TopupsController {
  constructor(private readonly service: TopupsService) {}

  @Post(':id/simulate')
  @ApiOperation({
    summary: 'Giả lập kết quả nạp tiền (Sandbox/Testing)',
    description:
      'Chỉ dành cho môi trường sandbox/development/testing: Giả lập kết quả thành công hoặc thất bại từ cổng thanh toán đối với giao dịch nạp tiền đang ở trạng thái pending mà không cần gọi qua VNPAY thật.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của giao dịch nạp tiền (UUID)',
    format: 'uuid',
    type: String,
  })
  @ApiBody({
    type: SimulateTopupDto,
    description: 'Kết quả giả lập: success hoặc failure',
  })
  @ApiResponse({
    status: 200,
    description:
      'Ghi nhận kết quả giả lập thành công; kết quả sẽ được xử lý bất đồng bộ và đồng bộ ví.',
  })
  @ApiResponse({
    status: 400,
    description: 'Giao dịch không hợp lệ hoặc không ở trạng thái pending.',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa xác thực (thiếu Bearer token).',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy giao dịch nạp tiền.',
  })
  async simulate(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulateTopupDto,
  ) {
    return buildSuccessResponse(
      await this.service.simulate(requireUserId(user), id, dto.outcome),
      'Simulated provider result recorded; query status for Wallet confirmation',
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Tạo yêu cầu nạp tiền (Top-up)',
    description:
      'Tạo yêu cầu nạp tiền vào ví HandyGo qua cổng thanh toán VNPAY (tỷ lệ 1 VND = 1 Point). Trả về URL thanh toán VNPAY để chuyển hướng người dùng.',
  })
  @ApiBody({
    type: CreateTopupDto,
    description:
      'Thông tin số tiền nạp và idempotency key để tránh tạo trùng lặp',
  })
  @ApiResponse({
    status: 201,
    description:
      'Tạo yêu cầu nạp tiền thành công, trả về URL thanh toán VNPAY.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Dữ liệu không hợp lệ (số tiền phải từ 1 đến 999,999,999 VND).',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa xác thực (thiếu Bearer token).',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateTopupDto,
    @Req() req: Request,
  ) {
    return buildSuccessResponse(
      await this.service.create(requireUserId(user), dto, clientIp(req)),
      'Top-up created',
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lấy lịch sử nạp tiền của người dùng',
    description:
      'Xem danh sách các giao dịch nạp tiền của tài khoản hiện tại, hỗ trợ phân trang (page, limit).',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách giao dịch nạp tiền phân trang thành công.',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa xác thực (thiếu Bearer token).',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: PaymentPaginationDto,
  ) {
    return buildSuccessResponse(
      await this.service.list(requireUserId(user), query),
      'Top-ups retrieved',
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Xem chi tiết giao dịch nạp tiền',
    description:
      'Tra cứu trạng thái và thông tin chi tiết của một giao dịch nạp tiền theo ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID giao dịch nạp tiền (UUID)',
    format: 'uuid',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Thông tin chi tiết giao dịch nạp tiền.',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa xác thực (thiếu Bearer token).',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy giao dịch nạp tiền.',
  })
  async get(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.get(requireUserId(user), id),
      'Top-up retrieved',
    );
  }
}

@Controller()
export class WalletTopupEventsConsumer {
  constructor(private readonly inbox: PaymentInboxService) {}

  @EventPattern(WALLET_TOPUP_CREDITED)
  credited(@Payload() payload: unknown, @Ctx() context: unknown) {
    return this.inbox.consume(
      WALLET_TOPUP_CREDITED,
      payload,
      context as RmqContext,
    );
  }
}
