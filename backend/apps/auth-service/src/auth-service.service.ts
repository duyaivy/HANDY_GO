import { Injectable } from '@nestjs/common';
import { TokenSignerService } from '@app/auth';
import {
  RegisterDto,
  RegisterFlowService,
  type RegisterResponse,
} from './register/index.js';
import {
  VerifyOtpDto,
  ResendOtpDto,
  OtpFlowService,
  type ResendOtpResponse,
} from './otp/index.js';
import {
  LoginDto,
  RefreshTokenDto,
  LogoutDto,
  LoginFlowService,
  type AuthSuccessResponse,
  type LogoutResponse,
  type MeResponse,
} from './login/index.js';

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

  async resendOtp(
    dto: ResendOtpDto,
    clientIp?: string,
  ): Promise<ResendOtpResponse> {
    return this.otpFlow.resendOtp(dto, clientIp);
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
