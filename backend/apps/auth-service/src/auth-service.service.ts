import { Injectable } from '@nestjs/common';
import { TokenSignerService } from '@app/auth';
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
import { RegisterFlowService } from './flows/register-flow.service.js';
import { OtpFlowService } from './flows/otp-flow.service.js';
import { LoginFlowService } from './flows/login-flow.service.js';

@Injectable()
export class AuthServiceService {
  constructor(
    private readonly registerFlow: RegisterFlowService,
    private readonly otpFlow: OtpFlowService,
    private readonly loginFlow: LoginFlowService,
    public readonly tokenSigner: TokenSignerService,
  ) {}

  async register(
    dto: RegisterDto,
    clientIp = '127.0.0.1',
  ): Promise<RegisterResponse> {
    return this.registerFlow.execute(dto, clientIp);
  }

  async verifyEmail(
    dto: VerifyOtpDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<AuthSuccessResponse> {
    return this.otpFlow.verifyEmail(dto, clientIp, userAgent);
  }

  async resendOtp(dto: ResendOtpDto): Promise<ResendOtpResponse> {
    return this.otpFlow.resendOtp(dto);
  }

  async login(
    dto: LoginDto,
    clientIp = '127.0.0.1',
    userAgent?: string,
  ): Promise<AuthSuccessResponse> {
    return this.loginFlow.login(dto, clientIp, userAgent);
  }

  async refresh(
    dto: RefreshTokenDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<AuthSuccessResponse> {
    return this.loginFlow.refresh(dto, clientIp, userAgent);
  }

  async logout(dto: LogoutDto): Promise<LogoutResponse> {
    return this.loginFlow.logout(dto);
  }

  async getMe(accountId: string): Promise<MeResponse> {
    return this.loginFlow.getMe(accountId);
  }
}
