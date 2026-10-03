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
import { VerifyOtpDto, ResendOtpDto, type ResendOtpResponse } from './index.js';
import type { AuthSuccessResponse } from '../common/dto/auth-responses.dto.js';
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
  @ApiResponse({ status: 200, description: 'Xác thực thành công, trả về token đăng nhập' })
  @ApiResponse({ status: 400, description: 'Mã OTP không hợp lệ hoặc đã hết hạn' })
  @ApiResponse({ status: 429, description: 'Vượt quá số lần thử OTP' })
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
  @ApiResponse({ status: 200, description: 'Gửi lại OTP thành công' })
  @ApiResponse({ status: 429, description: 'Chưa hết thời gian cooldown 60 giây hoặc vượt rate limit' })
  async resendOtp(
    @Body() dto: ResendOtpDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ): Promise<ResendOtpResponse> {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.otpFlow.resendOtp(dto, ip);
  }
}
