import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
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
    @Req() req: Request,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    const authHeader = authorization || (req.headers.authorization as string | undefined);
    const headers = { authorization: authHeader, 'x-request-id': requestId };

    const [profileRes, authRes] = await Promise.all([
      this.gatewayService.forwardRequest(
        'USER_TRUST_SERVICE_URL',
        '/api/v1/users/me',
        'GET',
        headers,
      ) as Promise<{ statusCode: number; message: string; data: Record<string, unknown> }>,
      this.gatewayService
        .forwardRequest('AUTH_SERVICE_URL', '/api/v1/auth/me', 'GET', headers)
        .then((res) => (res as { data?: Record<string, unknown> })?.data)
        .catch(() => null),
    ]);

    if (profileRes && profileRes.data) {
      return {
        ...profileRes,
        data: {
          ...profileRes.data,
          phone: authRes?.phone ?? null,
          email: authRes?.email ?? null,
          roles: authRes?.roles ?? [],
          permissions: authRes?.permissions ?? [],
          isVerified: authRes?.isVerified ?? false,
        },
      };
    }

    return profileRes;
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
