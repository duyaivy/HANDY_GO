import { HttpStatus, Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import {
  RequestChangeEmailDto,
  ConfirmChangeEmailDto,
} from './dto/change-email.dto.js';
import type {
  AuthSuccessResponse,
  ChangePasswordResponse,
  LogoutResponse,
  MeResponse,
} from '../common/dto/auth-responses.dto.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { LoginLockoutService } from '../common/security/login-lockout.service.js';
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
    private readonly lockoutService: LoginLockoutService,
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
    await this.lockoutService.checkFailedLogins(normalizedPhone);

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
      await this.lockoutService.recordFailedLogin(normalizedPhone);
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
      await this.lockoutService.recordFailedLogin(normalizedPhone);
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Số điện thoại hoặc mật khẩu không chính xác',
      );
    }

    // Reset failed attempts on valid credentials
    await this.lockoutService.resetFailedLogins(normalizedPhone);

    if (account.status !== 'active' && account.status !== 'pending') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản không ở trạng thái hoạt động.',
      );
    }

    if (!account.emailVerifiedAt || account.status === 'pending') {
      const challenge = account.otpChallenges[0];
      const isFailedDelivery = challenge?.deliveryStatus === 'failed';
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_PENDING,
        'Tài khoản chưa được kích hoạt. Vui lòng xác thực mã OTP.',
        {
          data: {
            verification: {
              challengeId: challenge?.id,
              phone: account.phone,
              emailMasked: account.email
                ? this.otpService.maskEmail(account.email)
                : '***',
              expiresAt: challenge?.expiresAt?.toISOString(),
              resendAvailableAt: isFailedDelivery
                ? new Date().toISOString()
                : challenge?.resendAvailableAt?.toISOString() ||
                  new Date().toISOString(),
            },
          },
        },
      );
    }

    // Verify user status in User & Trust Service
    await this.userTrustClient.confirmUserStatus(
      account.userId,
      this.sessionService.extractRolesAndPermissions(account).roleNames,
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

  async changePassword(
    accountId: string,
    dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    const account = await this.db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Tài khoản không tồn tại',
      );
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đang bị khóa hoặc vô hiệu hóa',
      );
    }

    const isOldPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      account.passwordHash,
    );
    if (!isOldPasswordValid) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Mật khẩu hiện tại không chính xác',
      );
    }

    if (dto.newPassword === dto.oldPassword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Mật khẩu mới không được trùng với mật khẩu cũ',
      );
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    const now = new Date();

    await this.db.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: accountId },
        data: {
          passwordHash: newPasswordHash,
          passwordChangedAt: now,
        },
      });

      await this.sessionService.revokeAllSessions(accountId, tx);
    });

    return AuthResponseBuilder.buildChangePasswordResponse();
  }

  async requestChangeEmail(
    accountId: string,
    dto: RequestChangeEmailDto,
  ): Promise<{ statusCode: number; message: string; data?: any }> {
    const account = await this.db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Tài khoản không tồn tại',
      );
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đang bị khóa hoặc vô hiệu hóa',
      );
    }

    const normalizedNewEmail = dto.newEmail.trim().toLowerCase();

    if (account.email && account.email.toLowerCase() === normalizedNewEmail) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Email mới không được trùng với email hiện tại',
      );
    }

    const existingAccount = await this.db.account.findUnique({
      where: { email: normalizedNewEmail },
    });

    if (existingAccount && existingAccount.id !== account.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.EMAIL_ALREADY_EXISTS,
        'Email này đã được sử dụng bởi một tài khoản khác',
      );
    }

    // Kiểm tra cooldown gửi lại OTP phía server
    const recentChallenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        deliveryStatus: `change_email:${normalizedNewEmail}`,
        isUsed: false,
        resendAvailableAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenge) {
      const waitSeconds = Math.max(
        1,
        Math.ceil(
          (recentChallenge.resendAvailableAt.getTime() - Date.now()) / 1000,
        ),
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.RATE_LIMITED,
        `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu mã OTP mới`,
      );
    }

    // Vô hiệu hóa các mã OTP cũ chưa sử dụng cho email này
    await this.db.otpChallenge.updateMany({
      where: {
        accountId: account.id,
        deliveryStatus: `change_email:${normalizedNewEmail}`,
        isUsed: false,
      },
      data: { isUsed: true },
    });

    const otp = this.otpService.generateOtp();

    await this.db.otpChallenge.create({
      data: {
        accountId: account.id,
        type: 'verify_email',
        otpHash: otp.hash,
        expiresAt: otp.expiresAt,
        resendAvailableAt: otp.resendAvailableAt,
        deliveryStatus: `change_email:${normalizedNewEmail}`,
      },
    });

    await this.otpService.sendChangeEmailOtp(normalizedNewEmail, otp.code);

    const cooldownSeconds = Math.max(
      0,
      Math.ceil((otp.resendAvailableAt.getTime() - Date.now()) / 1000),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Mã xác thực OTP đã được gửi đến email mới của bạn',
      data: {
        newEmail: normalizedNewEmail,
        resendAvailableAt: otp.resendAvailableAt,
        cooldownSeconds,
      },
    };
  }

  async confirmChangeEmail(
    accountId: string,
    dto: ConfirmChangeEmailDto,
  ): Promise<{ statusCode: number; message: string; data?: any }> {
    const account = await this.db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Tài khoản không tồn tại',
      );
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đang bị khóa hoặc vô hiệu hóa',
      );
    }

    const normalizedNewEmail = dto.newEmail.trim().toLowerCase();

    const challenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        deliveryStatus: `change_email:${normalizedNewEmail}`,
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    if (!challenge || challenge.expiresAt < now) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_INVALID,
        'Mã OTP không hợp lệ hoặc đã hết hạn',
      );
    }

    if (challenge.attempts >= 5) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        'Bạn đã nhập sai OTP quá 5 lần. Vui lòng yêu cầu mã mới.',
      );
    }

    const isMatch = this.otpService.verifyOtpHash(
      dto.otp.trim(),
      challenge.otpHash,
    );

    if (!isMatch) {
      await this.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_INVALID,
        'Mã OTP không chính xác. Vui lòng kiểm tra lại.',
      );
    }

    await this.db.$transaction(async (tx) => {
      // 1. Kiểm tra lại tính duy nhất của email trong transaction để chống race condition
      const emailConflict = await tx.account.findUnique({
        where: { email: normalizedNewEmail },
      });
      if (emailConflict && emailConflict.id !== account.id) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.EMAIL_ALREADY_EXISTS,
          'Email này đã được sử dụng bởi một tài khoản khác trong thời gian chờ OTP',
        );
      }

      // 2. Tiêu thụ challenge nguyên tử (atomic consume)
      const consumed = await tx.otpChallenge.updateMany({
        where: { id: challenge.id, isUsed: false },
        data: { isUsed: true },
      });

      if (consumed.count === 0) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.OTP_INVALID,
          'Mã OTP này đã được sử dụng hoặc không còn hiệu lực',
        );
      }

      // 3. Cập nhật email tài khoản
      await tx.account.update({
        where: { id: account.id },
        data: {
          email: normalizedNewEmail,
          emailVerifiedAt: now,
          updatedAt: now,
        },
      });

      // 4. Vô hiệu hóa các mã OTP đổi email còn lại của tài khoản này
      await tx.otpChallenge.updateMany({
        where: {
          accountId: account.id,
          deliveryStatus: { startsWith: 'change_email:' },
          isUsed: false,
        },
        data: { isUsed: true },
      });
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật email thành công',
      data: {
        email: normalizedNewEmail,
      },
    };
  }
}

export { LoginFlowService as LoginService };
