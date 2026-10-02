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
import type {
  AuthSuccessResponse,
  LogoutResponse,
  MeResponse,
} from '../common/dto/auth-responses.dto.js';
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
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  @ApiResponse({ status: 422, description: 'Sai thông tin đăng nhập (lỗi thực thể hiển thị lên form)' })
  @ApiResponse({ status: 403, description: 'Tài khoản chưa xác thực hoặc bị khóa' })
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
  @ApiOperation({ summary: 'Làm mới Access Token bằng Refresh Token' })
  @ApiResponse({ status: 200, description: 'Làm mới token thành công' })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ hoặc hết hạn' })
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
  @ApiOperation({ summary: 'Đăng xuất và thu hồi session' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(@Body() dto: LogoutDto): Promise<LogoutResponse> {
    return this.loginFlow.logout(dto);
  }

  @RequirePermissions(StandardPermissions.AUTH_ME)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.loginFlow.getMe(user.accountId);
  }
}
