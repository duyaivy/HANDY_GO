import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiGatewayService } from '../api-gateway.service.js';
import {
  GatewayLoginDto,
  GatewayLogoutDto,
  GatewayRefreshTokenDto,
  GatewayRegisterDto,
  GatewayResendOtpDto,
  GatewayVerifyOtpDto,
} from './dto/index.js';

@ApiTags('Auth Gateway')
@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly gatewayService: ApiGatewayService) {}

  private getForwardHeaders(req: Request, authorization?: string, requestId?: string) {
    const userAgent = req.headers['user-agent'] as string | undefined;
    // Gateway explicitly ignores client-supplied x-forwarded-for to prevent IP spoofing attacks.
    // IP is obtained directly from socket or trusted proxy connection.
    const clientIp = req.socket?.remoteAddress || req.ip || '127.0.0.1';

    return {
      authorization,
      'x-request-id': requestId || (req.headers['x-request-id'] as string | undefined),
      'x-forwarded-for': clientIp,
      'x-internal-secret': this.gatewayService.internalSecret,
      'user-agent': userAgent,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản khách hàng mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công, cần xác thực OTP' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Số điện thoại hoặc email đã tồn tại' })
  async register(
    @Body() body: GatewayRegisterDto,
    @Req() req: Request,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/register',
      'POST',
      this.getForwardHeaders(req, undefined, requestId),
      body,
    );
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực OTP kích hoạt tài khoản' })
  @ApiResponse({ status: 200, description: 'Xác thực thành công, tự động đăng nhập' })
  @ApiResponse({ status: 400, description: 'OTP sai hoặc hết hạn' })
  @ApiResponse({ status: 429, description: 'Vượt quá số lần thử OTP' })
  async verifyEmail(
    @Body() body: GatewayVerifyOtpDto,
    @Req() req: Request,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/verify-email',
      'POST',
      this.getForwardHeaders(req, undefined, requestId),
      body,
    );
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại mã OTP xác thực' })
  @ApiResponse({ status: 200, description: 'Gửi lại OTP thành công' })
  @ApiResponse({ status: 429, description: 'Cooldown 60 giây chưa hết' })
  async resendOtp(
    @Body() body: GatewayResendOtpDto,
    @Req() req: Request,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/resend-otp',
      'POST',
      this.getForwardHeaders(req, undefined, requestId),
      body,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập tài khoản' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về token' })
  @ApiResponse({ status: 401, description: 'Sai thông tin đăng nhập' })
  @ApiResponse({ status: 403, description: 'Tài khoản chưa kích hoạt hoặc bị khóa' })
  async login(
    @Body() body: GatewayLoginDto,
    @Req() req: Request,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/login',
      'POST',
      this.getForwardHeaders(req, undefined, requestId),
      body,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token' })
  @ApiResponse({ status: 200, description: 'Làm mới token thành công' })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ hoặc hết hạn' })
  async refresh(
    @Body() body: GatewayRefreshTokenDto,
    @Req() req: Request,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/refresh',
      'POST',
      this.getForwardHeaders(req, undefined, requestId),
      body,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất tài khoản' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(
    @Body() body: GatewayLogoutDto,
    @Req() req: Request,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/logout',
      'POST',
      this.getForwardHeaders(req, authorization, requestId),
      body,
    );
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  async getMe(
    @Req() req: Request,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<unknown> {
    return this.gatewayService.forwardRequest(
      'AUTH_SERVICE_URL',
      '/api/v1/auth/me',
      'GET',
      this.getForwardHeaders(req, authorization, requestId),
    );
  }
}
