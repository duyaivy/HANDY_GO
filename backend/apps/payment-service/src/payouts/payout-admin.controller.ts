import {
  Body,
  Controller,
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
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { Equals, IsIn, IsString, Length } from 'class-validator';
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';
import { PayoutsService } from './payouts.service.js';

export class ResolveSandboxPayoutDto {
  @ApiProperty({
    enum: ['succeeded', 'failed'],
    example: 'succeeded',
    description:
      'Kết quả phân xử mong muốn cho lệnh payout: succeeded (thành công) hoặc failed (thất bại)',
  })
  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed';

  @ApiProperty({
    example: 'Xác minh giao dịch chuyển khoản sandbox thành công qua đối soát mock',
    description: 'Lý do phân xử của Admin (từ 1 đến 500 ký tự)',
  })
  @IsString()
  @Length(1, 500)
  reason!: string;

  @ApiProperty({
    example: true,
    description:
      'Xác nhận phân xử trên môi trường Sandbox/Mock giả lập (bắt buộc phải là true)',
  })
  @Equals(true)
  confirmSimulated!: true;
}

@ApiTags('PayoutAdmin')
@ApiBearerAuth()
@Controller('payments/admin/operations/payouts')
@UseGuards(JwtAuthGuard)
export class PayoutAdminController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post(':id/resolve-sandbox')
  @ApiOperation({
    summary: 'Phân xử thủ công lệnh rút tiền (Payout) trên môi trường Sandbox/Mock',
    description:
      'Dành cho Admin phân xử thủ công kết quả cho lệnh rút tiền giả lập đang bị kẹt ở trạng thái needs_review ' +
      'do sự cố mạng không xác định (provider_outcome_unknown hoặc dispatch_interrupted). ' +
      'Sau khi phân xử, kết quả sẽ được ghi audit log và đồng bộ về Wallet Service để giải phóng tiền tạm giữ hoặc hoàn tất trừ tiền. ' +
      'Lưu ý: API này bị cấm hoàn toàn trên môi trường Production.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID của lệnh payout (UUID) cần phân xử',
    example: '185e13db-2aca-4305-a249-e1fe937a4a12',
  })
  @ApiBody({ type: ResolveSandboxPayoutDto })
  @ApiResponse({
    status: 200,
    description: 'Ghi nhận phân xử payout sandbox thành công',
  })
  @ApiResponse({
    status: 400,
    description:
      'Dữ liệu không hợp lệ (ID không phải UUID, confirmSimulated không phải true, hoặc thiếu reason)',
  })
  @ApiResponse({
    status: 403,
    description:
      'Từ chối truy cập: Thiếu quyền payment:reconcile, chạy trên Production, hoặc Admin tự phân xử đơn của chính mình',
  })
  @ApiResponse({
    status: 409,
    description:
      'Xung đột: Lệnh payout không ở trạng thái needs_review hoặc không có sự cố giả lập cần phân xử',
  })
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
