import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Admin xem danh sách quy tắc hoa hồng sàn',
    description:
      'Lấy danh sách các quy tắc tỷ lệ phần trăm hoa hồng nền tảng theo thời gian hiệu lực (phân trang page/limit). Yêu cầu quyền commission:manage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách quy tắc hoa hồng thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền commission:manage' })
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
  @ApiOperation({
    summary: 'Admin tạo quy tắc hoa hồng mới',
    description:
      'Tạo tỷ lệ hoa hồng mới áp dụng cho các giao dịch trong tương lai. effectiveFrom phải nằm ở tương lai và không thể áp dụng hồi tố. Yêu cầu quyền commission:manage.',
  })
  @ApiBody({ type: CreateCommissionRuleDto })
  @ApiResponse({ status: 201, description: 'Tạo quy tắc hoa hồng thành công' })
  @ApiResponse({
    status: 400,
    description:
      'Tỷ lệ hoa hồng không hợp lệ (tối đa 30.00%) hoặc ngày hiệu lực không đúng định dạng',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền commission:manage' })
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
