import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import type {
  ForgotPasswordResponse,
  VerifyResetOtpResponse,
  ResetPasswordResponse,
} from '../common/dto/auth-responses.dto.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { SessionService } from '../common/session/session.service.js';
import { AuthResponseBuilder } from '../common/utils/auth-response.builder.js';
import { normalizeClientIp } from '../common/utils/client-ip.util.js';
import {
  FORGOT_PASSWORD_EMAIL_LIMIT,
  FORGOT_PASSWORD_IP_LIMIT,
  FORGOT_PASSWORD_WINDOW_SECONDS,
  VERIFY_RESET_OTP_IP_LIMIT,
  VERIFY_RESET_OTP_WINDOW_SECONDS,
} from '../common/constants/auth.constants.js';
import {
  type IPasswordResetRepository,
  PASSWORD_RESET_REPOSITORY,
  PasswordResetRepository,
} from './repositories/password-reset.repository.js';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
  BcryptPasswordHasher,
} from '../common/security/password-hasher.js';
import {
  type IResetTokenService,
  RESET_TOKEN_SERVICE,
  ResetTokenService,
} from './services/reset-token.service.js';
import {
  type IPasswordResetEmailDispatcher,
  PASSWORD_RESET_EMAIL_DISPATCHER,
  PasswordResetEmailDispatcher,
} from './services/password-reset-email.dispatcher.js';

@Injectable()
export class PasswordResetFlowService {
  private readonly logger = new Logger(PasswordResetFlowService.name);

  private readonly repo: IPasswordResetRepository;
  private readonly passwordHasher: IPasswordHasher;
  private readonly tokenService: IResetTokenService;
  private readonly emailDispatcher: IPasswordResetEmailDispatcher;
  private readonly rateLimiter: RateLimiterService;
  private readonly sessionService: SessionService;
  private readonly otpService: OtpService;

  constructor(
    @Optional()
    @Inject(PASSWORD_RESET_REPOSITORY)
    injectedRepo?: IPasswordResetRepository,
    @Optional()
    @Inject(PASSWORD_HASHER)
    injectedHasher?: IPasswordHasher,
    @Optional()
    @Inject(RESET_TOKEN_SERVICE)
    injectedTokenService?: IResetTokenService,
    @Optional()
    @Inject(PASSWORD_RESET_EMAIL_DISPATCHER)
    injectedEmailDispatcher?: IPasswordResetEmailDispatcher,
    @Optional()
    @Inject(RateLimiterService)
    injectedRateLimiter?: RateLimiterService,
    @Optional()
    @Inject(SessionService)
    injectedSessionService?: SessionService,
    @Optional()
    @Inject(OtpService)
    injectedOtpService?: OtpService,
    @Optional()
    @Inject(AuthPrismaService)
    injectedDb?: AuthPrismaService,
  ) {
    this.rateLimiter = injectedRateLimiter!;
    this.sessionService = injectedSessionService!;
    this.otpService = injectedOtpService!;

    // Resolve repository abstraction or adapt legacy db instance
    if (injectedRepo) {
      this.repo = injectedRepo;
    } else if (injectedDb) {
      this.repo = new PasswordResetRepository(injectedDb);
    } else {
      throw new Error(
        'PasswordResetFlowService requires either PASSWORD_RESET_REPOSITORY or AuthPrismaService',
      );
    }

    // Resolve password hasher abstraction
    this.passwordHasher = injectedHasher ?? new BcryptPasswordHasher();

    // Resolve token service abstraction
    this.tokenService = injectedTokenService ?? new ResetTokenService();

    // Resolve email dispatcher abstraction
    this.emailDispatcher =
      injectedEmailDispatcher ??
      (this.otpService
        ? new PasswordResetEmailDispatcher(this.otpService)
        : ({} as IPasswordResetEmailDispatcher));
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    clientIp?: string,
  ): Promise<ForgotPasswordResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const ip = normalizeClientIp(clientIp, '127.0.0.1');

    // 1. Giới hạn tần suất theo IP: tối đa 10 yêu cầu/giờ
    await this.rateLimiter.checkAndIncrement(
      `forgot_password_ip:${ip}`,
      FORGOT_PASSWORD_IP_LIMIT,
      FORGOT_PASSWORD_WINDOW_SECONDS,
      'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 1 giờ.',
    );

    // 2. Giới hạn tần suất theo Email đã HMAC: tối đa 5 yêu cầu/giờ
    const emailHmac = this.otpService.hashEmail(normalizedEmail);
    await this.rateLimiter.checkAndIncrement(
      `forgot_password_email:${emailHmac}`,
      FORGOT_PASSWORD_EMAIL_LIMIT,
      FORGOT_PASSWORD_WINDOW_SECONDS,
      'Email này đã gửi quá nhiều yêu cầu đặt lại mật khẩu trong 1 giờ. Vui lòng thử lại sau.',
    );

    // 3. Tra cứu tài khoản theo email đã chuẩn hóa thông qua repository
    const account = await this.repo.findAccountByEmail(normalizedEmail);

    // 4. Chỉ tạo yêu cầu reset cho tài khoản:
    // - Tồn tại trong hệ thống
    // - status === 'active' (hoạt động)
    // - emailVerifiedAt !== null (đã xác minh email)
    const isEligible =
      account &&
      account.status === 'active' &&
      account.emailVerifiedAt !== null;

    if (!isEligible) {
      // Email không tồn tại, tài khoản chưa xác minh hoặc bị khóa:
      // Thực hiện delay/dummy work cân bằng timing nhằm triệt tiêu timing side-channel dò tài khoản
      await this.emailDispatcher.simulateEmailDispatchDelay();
      return AuthResponseBuilder.buildForgotPasswordResponse();
    }

    // 5. Sinh OTP ngẫu nhiên mới với HMAC hash và thời hạn (mặc định 10 phút)
    const otp = this.otpService.generateOtp();

    // 6. Xử lý race condition (P0):
    // Invalidate challenge cũ và tạo challenge pending mới trong một database transaction duy nhất
    // có khóa hàng FOR UPDATE để serialize các request đồng thời của cùng tài khoản
    const challenge = await this.repo.createResetChallenge({
      accountId: account.id,
      otpHash: otp.hash,
      expiresAt: otp.expiresAt,
      resendAvailableAt: otp.resendAvailableAt,
    });

    // 7. Gửi email qua EmailDispatcher abstraction
    try {
      await this.emailDispatcher.sendResetEmail(normalizedEmail, otp.code);
      await this.repo.updateChallengeDelivery(challenge.id, 'delivered');
    } catch (error) {
      this.logger.error(
        `Failed to deliver password reset OTP email: ${(error as Error).message}`,
      );
      await this.repo.updateChallengeDelivery(
        challenge.id,
        'failed',
        (error as Error).message,
      );
      // SMTP lỗi không làm lộ tài khoản qua status/body; challenge không được coi là đã gửi thành công
    }

    return AuthResponseBuilder.buildForgotPasswordResponse();
  }

  private throwGenericResetOtpError(): never {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ERROR_CODES.OTP_INVALID,
      'Mã OTP không hợp lệ hoặc đã hết hạn',
    );
  }

  async verifyResetOtp(
    dto: VerifyResetOtpDto,
    clientIp?: string,
  ): Promise<VerifyResetOtpResponse> {
    const ip = normalizeClientIp(clientIp, '127.0.0.1');

    // 1. Giới hạn tần suất theo IP: tối đa 10 yêu cầu/giờ
    await this.rateLimiter.checkAndIncrement(
      `verify_reset_otp_ip:${ip}`,
      VERIFY_RESET_OTP_IP_LIMIT,
      VERIFY_RESET_OTP_WINDOW_SECONDS,
      'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu xác thực OTP đặt lại mật khẩu. Vui lòng thử lại sau 1 giờ.',
    );

    const normalizedEmail = dto.email.trim().toLowerCase();

    // 2. Tra cứu tài khoản theo email đã chuẩn hóa
    const account = await this.repo.findAccountByEmail(normalizedEmail);

    if (!account) {
      this.throwGenericResetOtpError();
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      this.throwGenericResetOtpError();
    }

    // 3. Tìm challenge OTP mục đích reset_password mới nhất
    const now = new Date();
    const maxAttempts = this.otpService?.maxAttempts ?? OtpService.MAX_ATTEMPTS;

    const challenge = await this.repo.findLatestResetChallenge(account.id);

    if (!challenge || challenge.deliveryStatus !== 'delivered') {
      this.throwGenericResetOtpError();
    }

    if (challenge.isUsed) {
      this.throwGenericResetOtpError();
    }

    if (challenge.expiresAt <= now) {
      this.throwGenericResetOtpError();
    }

    if (challenge.attempts >= maxAttempts) {
      this.throwGenericResetOtpError();
    }

    // 4. So khớp mã OTP
    const isMatch = this.otpService.verifyOtpHash(dto.otp, challenge.otpHash);
    if (!isMatch) {
      // Cập nhật nguyên tử số lần thử thất bại trong transaction có điều kiện
      await this.repo.incrementChallengeAttempts(challenge.id, maxAttempts);
      this.throwGenericResetOtpError();
    }

    // 5. Khi OTP hợp lệ:
    // Tạo reset grant ngẫu nhiên (32 bytes hex), ngắn hạn (15 phút), chỉ lưu hash (SHA-256) qua TokenService
    const tokenData = this.tokenService.generateResetToken();

    // Cập nhật nguyên tử trong transaction: đánh dấu challenge đã dùng và tạo grant
    const success = await this.repo.consumeChallengeAndCreateGrant({
      challengeId: challenge.id,
      accountId: account.id,
      maxAttempts,
      tokenHash: tokenData.tokenHash,
      grantExpiresAt: tokenData.expiresAt,
    });

    if (!success) {
      this.throwGenericResetOtpError();
    }

    return AuthResponseBuilder.buildVerifyResetOtpResponse(
      tokenData.rawToken,
      tokenData.lifetimeSeconds,
    );
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponse> {
    // 1. Hash resetToken qua tokenService abstraction để tra cứu
    const tokenHash = this.tokenService.hashToken(dto.resetToken);

    const grant = await this.repo.findGrantByTokenHash(tokenHash);

    if (!grant) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Mã xác thực đặt lại mật khẩu không hợp lệ hoặc không tồn tại.',
      );
    }

    if (grant.isUsed) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Mã xác thực đặt lại mật khẩu đã được sử dụng.',
      );
    }

    const now = new Date();
    if (grant.expiresAt <= now) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Mã xác thực đặt lại mật khẩu đã hết hạn.',
      );
    }

    // 2. Mã hóa mật khẩu mới bằng passwordHasher abstraction trước khi mở transaction
    const newPasswordHash = await this.passwordHasher.hash(dto.newPassword);

    // 3. Trong một transaction duy nhất thông qua repository:
    // - Tiêu thụ grant bằng cập nhật có điều kiện (CAS: isUsed: false, expiresAt > now)
    // - Cập nhật hash và passwordChangedAt
    // - Thu hồi tất cả Refresh Session hiện có của tài khoản
    const success = await this.repo.completePasswordReset({
      grantId: grant.id,
      accountId: grant.accountId,
      newPasswordHash,
      updateTime: now,
      revokeSessions: (tx) =>
        this.sessionService.revokeAllSessions(grant.accountId, tx),
    });

    if (!success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Mã xác thực đặt lại mật khẩu đã được sử dụng hoặc đã hết hạn.',
      );
    }

    return AuthResponseBuilder.buildResetPasswordResponse();
  }
}
