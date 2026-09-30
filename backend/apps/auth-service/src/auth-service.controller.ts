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
import crypto from 'node:crypto';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  StandardPermissions,
  type AuthenticatedUser,
} from '@app/auth';
import { ConfigService } from '@app/config';
import { AuthServiceService } from './auth-service.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import type {
  AuthSuccessResponse,
  LogoutResponse,
  MeResponse,
  RegisterResponse,
  ResendOtpResponse,
} from './dto/auth-responses.dto.js';
import {
  FORWARDED_FOR_HEADER,
  INTERNAL_GATEWAY_HEADER,
  USER_AGENT_HEADER,
} from './auth.constants.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthServiceController {
  constructor(
    private readonly authService: AuthServiceService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Only trusts forwarded client IP when the request includes a valid internal gateway secret.
   * If secret is missing or mismatched, strictly falls back to socket IP.
   */
  private resolveClientIp(req: Request, fallbackIp?: string): string {
    const incomingSecret = req?.headers?.[INTERNAL_GATEWAY_HEADER];
    const expectedSecret = this.config.internalServiceSecret;

    const isTrustedGateway = Boolean(
      expectedSecret &&
        typeof incomingSecret === 'string' &&
        incomingSecret.length === expectedSecret.length &&
        crypto.timingSafeEqual(
          Buffer.from(incomingSecret),
          Buffer.from(expectedSecret),
        ),
    );

    if (isTrustedGateway) {
      const forwarded = req?.headers?.[FORWARDED_FOR_HEADER];
      if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
        return forwarded.split(',')[0].trim();
      }
    }

    return (
      fallbackIp ||
      req?.socket?.remoteAddress ||
      req?.ip ||
      '127.0.0.1'
    );
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công, cần xác thực OTP' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Số điện thoại hoặc email đã tồn tại' })
  async register(
    @Body() dto: RegisterDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<RegisterResponse> {
    const ip = this.resolveClientIp(req, clientIp);
    return this.authService.register(dto, ip);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực OTP kích hoạt tài khoản' })
  @ApiResponse({ status: 200, description: 'Xác thực thành công, trả về token đăng nhập' })
  @ApiResponse({ status: 400, description: 'Mã OTP không hợp lệ hoặc đã hết hạn' })
  @ApiResponse({ status: 429, description: 'Vượt quá số lần thử OTP' })
  async verifyEmail(
    @Body() dto: VerifyOtpDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<AuthSuccessResponse> {
    const userAgent = req?.headers?.[USER_AGENT_HEADER] as string | undefined;
    const ip = this.resolveClientIp(req, clientIp);
    return this.authService.verifyEmail(dto, ip, userAgent);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại mã OTP xác thực' })
  @ApiResponse({ status: 200, description: 'Gửi lại OTP thành công' })
  @ApiResponse({ status: 429, description: 'Chưa hết thời gian cooldown 60 giây' })
  async resendOtp(@Body() dto: ResendOtpDto): Promise<ResendOtpResponse> {
    return this.authService.resendOtp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng số điện thoại và mật khẩu' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  @ApiResponse({ status: 401, description: 'Sai thông tin đăng nhập' })
  @ApiResponse({ status: 403, description: 'Tài khoản chưa xác thực hoặc bị khóa' })
  async login(
    @Body() dto: LoginDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<AuthSuccessResponse> {
    const userAgent = req?.headers?.[USER_AGENT_HEADER] as string | undefined;
    const ip = this.resolveClientIp(req, clientIp);
    return this.authService.login(dto, ip, userAgent);
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
    const ip = this.resolveClientIp(req, clientIp);
    return this.authService.refresh(dto, ip, userAgent);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất và thu hồi session' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(@Body() dto: LogoutDto): Promise<LogoutResponse> {
    return this.authService.logout(dto);
  }

  // NOTE: APP_GUARD registers JwtAuthGuard and PermissionsGuard globally,
  // so manual @UseGuards(...) is redundant and omitted here.
  @RequirePermissions(StandardPermissions.AUTH_ME)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.authService.getMe(user.accountId);
  }
}
