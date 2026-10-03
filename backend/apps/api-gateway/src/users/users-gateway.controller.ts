import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiGatewayService } from '../api-gateway.service.js';

@ApiTags('Users Gateway')
@Controller('users')
export class UsersGatewayController {
  constructor(private readonly gatewayService: ApiGatewayService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ của tài khoản đang đăng nhập' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async getMyProfile(
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'USER_TRUST_SERVICE_URL',
      '/api/v1/users/me',
      'GET',
      { authorization, 'x-request-id': requestId },
    );
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ tài khoản đang đăng nhập' })
  @ApiResponse({ status: 200, description: 'Cập nhật hồ sơ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async updateMyProfile(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'USER_TRUST_SERVICE_URL',
      '/api/v1/users/me',
      'PATCH',
      { authorization, 'x-request-id': requestId },
      body,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy hồ sơ người dùng theo ID' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập hồ sơ người khác' })
  async getUserProfile(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'USER_TRUST_SERVICE_URL',
      `/api/v1/users/${id}`,
      'GET',
      { authorization, 'x-request-id': requestId },
    );
  }
}
