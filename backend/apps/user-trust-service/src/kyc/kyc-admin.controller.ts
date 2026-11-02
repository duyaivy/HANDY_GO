import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermissions,
  StandardPermissions,
  type AuthenticatedUser,
} from '@app/auth';
import { KycService } from './kyc.service.js';
import { ListKycCasesDto } from './dto/list-kyc-cases.dto.js';
import { ReviewKycCaseDto } from './dto/review-kyc-case.dto.js';

@ApiTags('Admin KYC Management')
@Controller('admin/kyc-cases')
export class KycAdminController {
  constructor(private readonly kycService: KycService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách các hồ sơ KYC (Dành cho Quản trị viên)',
    description: 'Hỗ trợ lọc theo trạng thái và phân trang.',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách hồ sơ KYC thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền Admin' })
  async listKycCases(
    @Query() query: ListKycCasesDto,
  ): Promise<unknown> {
    return this.kycService.listAdminKycCases(query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy chi tiết hồ sơ KYC và kết quả phân tích AI',
    description: 'Xem đầy đủ ảnh CCCD, ảnh selfie, kết quả OCR và điểm đối sánh khuôn mặt từ AI.',
  })
  @ApiParam({ name: 'id', description: 'ID của hồ sơ KYC' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết hồ sơ thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ KYC' })
  async getKycCaseDetail(
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.kycService.getAdminKycCaseDetail(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Quản trị viên phê duyệt hoặc từ chối hồ sơ xác minh KYC',
    description:
      'Cập nhật trạng thái KYC và đồng bộ WorkerProfile thành verified hoặc rejected. Ngăn duyệt trùng hoặc sửa đổi hồ sơ đã duyệt.',
  })
  @ApiParam({ name: 'id', description: 'ID của hồ sơ KYC' })
  @ApiResponse({ status: 200, description: 'Đã hoàn tất duyệt hồ sơ KYC' })
  @ApiResponse({ status: 400, description: 'Hồ sơ không hợp lệ hoặc đã được duyệt trước đó' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ KYC' })
  async reviewKycCase(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewKycCaseDto,
  ): Promise<unknown> {
    return this.kycService.reviewKycCase(adminUser.userId, id, dto);
  }
}
