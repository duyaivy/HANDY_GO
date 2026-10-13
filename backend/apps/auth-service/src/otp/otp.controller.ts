import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '@app/auth';
import { ConfigService } from '@app/config';
import {
  VerifyOtpDto,
  ResendOtpDto,
  ForgotPasswordDto,
  VerifyResetOtpDto,
  ResetPasswordDto,
  ResendOtpResponseDto,
  type ResendOtpResponse,
} from './index.js';
import {
  AuthSuccessResponseDto,
  ForgotPasswordResponseDto,
  VerifyResetOtpResponseDto,
  ResetPasswordResponseDto,
  type AuthSuccessResponse,
  type ForgotPasswordResponse,
  type VerifyResetOtpResponse,
  type ResetPasswordResponse,
} from '../common/dto/auth-responses.dto.js';
import { ApiErrorResponseDto } from '@app/common';
import { resolveClientIp } from '../common/utils/client-ip.util.js';
import { USER_AGENT_HEADER } from '../common/constants/auth.constants.js';
import { OtpFlowService } from './otp-flow.service.js';

@ApiTags('Auth')
@Controller('auth')
export class OtpController {
  constructor(
    private readonly otpFlow: OtpFlowService,
    private readonly config: ConfigService,
  ) {}

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
    return this.otpFlow.verifyEmail(dto, ip, userAgent);
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
    return this.otpFlow.resendOtp(dto, ip);
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
    return this.otpFlow.forgotPassword(dto, ip);
  }

  @Public()
  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác thực mã OTP đặt lại mật khẩu và nhận reset token',
    description: 'Kiểm tra mã OTP 6 chữ số cho mục đích reset_password. Khi hợp lệ, cấp mã resetToken ngắn hạn 15 phút dùng một lần.',
  })
  @ApiResponse({ status: 200, description: 'Xác thực OTP thành công, trả về reset token ngắn hạn', type: VerifyResetOtpResponseDto })
  @ApiResponse({ status: 400, description: 'Mã OTP không hợp lệ, đã hết hạn hoặc đã được sử dụng', type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Tài khoản không ở trạng thái hoạt động', type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Vượt quá số lần thử OTP cho phép (tối đa 5 lần)', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Lỗi máy chủ nội bộ', type: ApiErrorResponseDto })
  async verifyResetOtp(
    @Body() dto: VerifyResetOtpDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<VerifyResetOtpResponse> {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.otpFlow.verifyResetOtp(dto, ip);
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
    return this.otpFlow.resetPassword(dto);
  }
}

