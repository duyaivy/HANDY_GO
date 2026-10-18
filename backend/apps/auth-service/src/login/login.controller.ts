import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  StandardPermissions,
  type AuthenticatedUser,
} from '@app/auth';
import { ConfigService } from '@app/config';
import {
  LoginDto,
  RefreshTokenDto,
  LogoutDto,
} from './index.js';
import {
  AuthSuccessResponseDto,
  LogoutResponseDto,
  MeResponseDto,
  type AuthSuccessResponse,
  type LogoutResponse,
  type MeResponse,
} from '../common/dto/auth-responses.dto.js';
import { ApiErrorResponseDto } from '@app/common';
import { resolveClientIp } from '../common/utils/client-ip.util.js';
import { USER_AGENT_HEADER } from '../common/constants/auth.constants.js';
import { LoginFlowService } from './login-flow.service.js';

@ApiTags('Auth')
@Controller('auth')
export class LoginController {
  constructor(
    private readonly loginFlow: LoginFlowService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng số điện thoại và mật khẩu' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công', type: AuthSuccessResponseDto })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ', type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Tài khoản chưa xác thực hoặc bị khóa', type: ApiErrorResponseDto })
  @ApiResponse({ status: 422, description: 'Sai thông tin đăng nhập (lỗi thực thể hiển thị lên form)', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<AuthSuccessResponse> {
    const userAgent = req?.headers?.[USER_AGENT_HEADER] as string | undefined;
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.loginFlow.login(dto, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Làm mới Access Token bằng Refresh Token',
    description: 'Cấp mới Access Token (15 phút, tokenType: access) và Refresh Token mới theo cơ chế rotation. Không yêu cầu Bearer Access Token tại Gateway.',
  })
  @ApiResponse({ status: 200, description: 'Làm mới token thành công', type: AuthSuccessResponseDto })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc thiếu refreshToken', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ, hết hạn hoặc đã bị thu hồi', type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Tài khoản bị vô hiệu hóa hoặc không hợp lệ', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<AuthSuccessResponse> {
    const userAgent = req?.headers?.[USER_AGENT_HEADER] as string | undefined;
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.loginFlow.refresh(dto, ip, userAgent);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng xuất và thu hồi session',
    description: 'Thu hồi session theo hash của Refresh Token gửi trong request body. Endpoint này là public tại Gateway và không yêu cầu Bearer token xác thực.',
  })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công', type: LogoutResponseDto })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc thiếu refreshToken', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async logout(@Body() dto: LogoutDto): Promise<LogoutResponse> {
    return this.loginFlow.logout(dto);
  }

  @RequirePermissions(StandardPermissions.AUTH_ME)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công', type: MeResponseDto })
  @ApiResponse({ status: 401, description: 'Chưa xác thực', type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.loginFlow.getMe(user.accountId);
  }
}
