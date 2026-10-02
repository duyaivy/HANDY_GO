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
import { RegisterDto, type RegisterResponse } from './index.js';
import { resolveClientIp } from '../common/utils/client-ip.util.js';
import { RegisterFlowService } from './register-flow.service.js';

@ApiTags('Auth')
@Controller('auth')
export class RegisterController {
  constructor(
    private readonly registerFlow: RegisterFlowService,
    private readonly config: ConfigService,
  ) {}

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
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.registerFlow.execute(dto, ip);
  }
}
