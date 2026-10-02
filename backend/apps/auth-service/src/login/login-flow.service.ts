import { HttpStatus, Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import type {
  AuthSuccessResponse,
  LogoutResponse,
  MeResponse,
} from '../common/dto/auth-responses.dto.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { OtpService } from '../otp/otp.service.js';
import { UserTrustClient } from '../common/rpc/user-trust.client.js';
import { SessionService } from '../common/session/session.service.js';
import { normalizeVietnamesePhone } from '../common/utils/phone.util.js';
import { AuthResponseBuilder } from '../common/utils/auth-response.builder.js';
import {
  LOGIN_IP_RATE_LIMIT,
  LOGIN_IP_WINDOW_SECONDS,
} from '../common/constants/auth.constants.js';

@Injectable()
export class LoginFlowService {
  constructor(
    private readonly db: AuthPrismaService,
    private readonly rateLimiter: RateLimiterService,
    private readonly otpService: OtpService,
    private readonly userTrustClient: UserTrustClient,
    private readonly sessionService: SessionService,
  ) {}

  async login(
    dto: LoginDto,
    clientIp = '127.0.0.1',
    userAgent?: string,
  ): Promise<AuthSuccessResponse> {
    // 1. IP rate limiting: max 30 requests / minute
    await this.rateLimiter.checkAndIncrement(
      `login_ip:${clientIp}`,
      LOGIN_IP_RATE_LIMIT,
      LOGIN_IP_WINDOW_SECONDS,
      'Bạn đã thử đăng nhập quá nhiều lần từ địa chỉ này. Vui lòng thử lại sau 1 phút.',
    );

    const normalizedPhone = normalizeVietnamesePhone(dto.phone);

    // 2. Failed login rate limit check by phone
    await this.rateLimiter.checkFailedLogins(normalizedPhone);

    const account = await this.db.account.findUnique({
      where: { phone: normalizedPhone },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissionRoles: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        otpChallenges: {
          where: { isUsed: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!account) {
      await this.rateLimiter.recordFailedLogin(normalizedPhone);
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Số điện thoại hoặc mật khẩu không chính xác',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      account.passwordHash,
    );
    if (!isPasswordValid) {
      await this.rateLimiter.recordFailedLogin(normalizedPhone);
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Số điện thoại hoặc mật khẩu không chính xác',
      );
    }

    // Reset failed attempts on valid credentials
    await this.rateLimiter.resetFailedLogins(normalizedPhone);

    if (account.status !== 'active' && account.status !== 'pending') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản không ở trạng thái hoạt động.',
      );
    }

    if (!account.emailVerifiedAt || account.status === 'pending') {
      const challenge = account.otpChallenges[0];
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_PENDING,
        'Tài khoản chưa được kích hoạt. Vui lòng xác thực mã OTP.',
        {
          details: {
            verification: {
              phone: account.phone,
              emailMasked: account.email
                ? this.otpService.maskEmail(account.email)
                : '***',
              expiresAt: challenge?.expiresAt?.toISOString(),
              resendAvailableAt:
                challenge?.resendAvailableAt?.toISOString() ||
                new Date().toISOString(),
            },
          },
        },
      );
    }

    // Verify user status in User & Trust Service
    await this.userTrustClient.confirmUserStatus(
      account.userId,
      account.roles.map(({ role }) => role.name),
    );

    // Create session (signs access token FIRST, then saves session)
    const session = await this.sessionService.createSession(
      account,
      clientIp,
      userAgent,
    );

    return AuthResponseBuilder.buildAuthSuccessResponse(
      'Đăng nhập thành công',
      {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
      },
      session.user,
    );
  }

  async refresh(
    dto: RefreshTokenDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<AuthSuccessResponse> {
    const session = await this.sessionService.rotateSession(
      dto.refreshToken,
      clientIp,
      userAgent,
    );

    return AuthResponseBuilder.buildAuthSuccessResponse(
      'Làm mới token thành công',
      {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
      },
      session.user,
    );
  }

  async logout(dto: LogoutDto): Promise<LogoutResponse> {
    await this.sessionService.revokeSession(dto.refreshToken);
    return AuthResponseBuilder.buildLogoutResponse();
  }

  async getMe(accountId: string): Promise<MeResponse> {
    const account = await this.db.account.findUnique({
      where: { id: accountId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissionRoles: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Tài khoản không tồn tại',
      );
    }

    const { roleNames, permissions } =
      this.sessionService.extractRolesAndPermissions(account);

    return AuthResponseBuilder.buildMeResponse(account, roleNames, permissions);
  }
}

export { LoginFlowService as LoginService };
