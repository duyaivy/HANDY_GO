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
import { ApiErrorResponseDto } from '@app/common';
import { AuthServiceService } from './auth-service.service.js';
import { RegisterDto, RegisterResponseDto, type RegisterResponse } from './register/index.js';
import {
  VerifyOtpDto,
  ResendOtpDto,
  ForgotPasswordDto,
  VerifyResetOtpDto,
  ResetPasswordDto,
  ResendOtpResponseDto,
  type ResendOtpResponse,
} from './otp/index.js';
import {
  LoginDto,
  RefreshTokenDto,
  LogoutDto,
} from './login/index.js';
import {
  AuthSuccessResponseDto,
  ForgotPasswordResponseDto,
  VerifyResetOtpResponseDto,
  ResetPasswordResponseDto,
  LogoutResponseDto,
  MeResponseDto,
  type AuthSuccessResponse,
  type ForgotPasswordResponse,
  type VerifyResetOtpResponse,
  type ResetPasswordResponse,
  type LogoutResponse,
  type MeResponse,
} from './common/dto/auth-responses.dto.js';
import { resolveClientIp } from './common/utils/client-ip.util.js';
import { USER_AGENT_HEADER } from './common/constants/auth.constants.js';

/**
 * @deprecated Use RegisterController, OtpController, and LoginController from their respective feature modules.
 * Maintained as a facade for backwards compatibility with existing test suites.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthServiceController {
  constructor(
    private readonly authService: AuthServiceService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công, cần xác thực OTP', type: RegisterResponseDto })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ', type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Số điện thoại hoặc email đã tồn tại', type: ApiErrorResponseDto })
  @ApiResponse({ status: 424, description: 'Tạo tài khoản thành công nhưng không gửi được OTP', type: ApiErrorResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<RegisterResponse> {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.authService.register(dto, ip);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực OTP kích hoạt tài khoản' })
  @ApiResponse({ status: 200, description: 'Xác thực thành công, trả về token đăng nhập', type: AuthSuccessResponseDto })
  @ApiResponse({ status: 400, description: 'Mã OTP không hợp lệ hoặc đã hết hạn', type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Vượt quá số lần thử OTP', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async verifyEmail(
    @Body() dto: VerifyOtpDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<AuthSuccessResponse> {
    const userAgent = req?.headers?.[USER_AGENT_HEADER] as string | undefined;
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.authService.verifyEmail(dto, ip, userAgent);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại mã OTP xác thực' })
  @ApiResponse({ status: 200, description: 'Gửi lại OTP thành công', type: ResendOtpResponseDto })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ', type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Chưa hết thời gian cooldown 60 giây hoặc vượt rate limit', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async resendOtp(
    @Body() dto: ResendOtpDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<ResendOtpResponse> {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.authService.resendOtp(dto, ip);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Yêu cầu mã xác thực đặt lại mật khẩu qua email',
    description: 'Gửi OTP 6 chữ số qua email nếu tài khoản tồn tại và đã kích hoạt. Luôn trả về thông báo chung để tránh dò tìm tài khoản.',
  })
  @ApiResponse({
    status: 200,
    description: 'Phản hồi công khai không tiết lộ sự tồn tại của tài khoản',
    type: ForgotPasswordResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc sai định dạng email', type: ApiErrorResponseDto })
  @ApiResponse({
    status: 429,
    description: 'Vượt quá giới hạn yêu cầu theo email (tối đa 5 lần/giờ) hoặc IP (tối đa 10 lần/giờ)',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<ForgotPasswordResponse> {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.authService.forgotPassword(dto, ip);
  }

  @Public()
  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác thực mã OTP đặt lại mật khẩu và nhận reset token',
    description: 'Kiểm tra mã OTP 6 chữ số cho mục đích reset_password. Khi hợp lệ, cấp mã resetToken ngắn hạn 15 phút dùng một lần. Giới hạn tối đa 10 yêu cầu/giờ theo địa chỉ IP.',
  })
  @ApiResponse({ status: 200, description: 'Xác thực OTP thành công, trả về reset token ngắn hạn', type: VerifyResetOtpResponseDto })
  @ApiResponse({ status: 400, description: 'Mã OTP không hợp lệ, đã hết hạn hoặc thông tin không chính xác', type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Vượt quá giới hạn yêu cầu theo IP (tối đa 10 lần/giờ)', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async verifyResetOtp(
    @Body() dto: VerifyResetOtpDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<VerifyResetOtpResponse> {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.authService.verifyResetOtp(dto, ip);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đặt lại mật khẩu mới bằng reset token một lần',
    description: 'Sử dụng reset token nhận từ bước verify-reset-otp để đổi mật khẩu. Cập nhật mật khẩu trong transaction và thu hồi toàn bộ session hiện có.',
  })
  @ApiResponse({ status: 200, description: 'Đặt lại mật khẩu thành công', type: ResetPasswordResponseDto })
  @ApiResponse({ status: 400, description: 'Mã reset token không hợp lệ, đã hết hạn, đã được sử dụng hoặc mật khẩu không đủ độ mạnh', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponse> {
    return this.authService.resetPassword(dto);
  }

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
    return this.authService.login(dto, ip, userAgent);
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
    return this.authService.refresh(dto, ip, userAgent);
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
    return this.authService.logout(dto);
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
    return this.authService.getMe(user.accountId);
  }
}
