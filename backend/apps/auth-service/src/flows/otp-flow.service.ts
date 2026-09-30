import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { VerifyOtpDto } from '../dto/verify-otp.dto.js';
import { ResendOtpDto } from '../dto/resend-otp.dto.js';
import type {
  AuthSuccessResponse,
  ResendOtpResponse,
} from '../dto/auth-responses.dto.js';
import { OtpService } from '../otp/otp.service.js';
import { RateLimiterService } from '../rate-limit/rate-limiter.service.js';
import { UserTrustClient } from '../rpc/user-trust.client.js';
import { SessionService } from '../session/session.service.js';
import { normalizeVietnamesePhone } from '../utils/phone.util.js';
import { AuthResponseBuilder } from '../utils/auth-response.builder.js';
import {
  RESEND_OTP_LIMIT,
  RESEND_OTP_WINDOW_SECONDS,
} from '../auth.constants.js';

@Injectable()
export class OtpFlowService {
  private readonly logger = new Logger(OtpFlowService.name);

  constructor(
    private readonly db: AuthPrismaService,
    private readonly otpService: OtpService,
    private readonly rateLimiter: RateLimiterService,
    private readonly userTrustClient: UserTrustClient,
    private readonly sessionService: SessionService,
  ) {}

  async verifyEmail(
    dto: VerifyOtpDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<AuthSuccessResponse> {
    if (!dto.email && !dto.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Vui lòng cung cấp email hoặc số điện thoại',
      );
    }

    const whereClause: { email?: string; phone?: string } = {};
    if (dto.email) {
      whereClause.email = dto.email.trim().toLowerCase();
    } else if (dto.phone) {
      whereClause.phone = normalizeVietnamesePhone(dto.phone);
    }

    const account = await this.db.account.findFirst({
      where: whereClause,
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
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Tài khoản không tồn tại',
      );
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đã bị tạm khóa. Không thể kích hoạt bằng OTP.',
      );
    }

    // OTP verification strictly applies ONLY to accounts in 'pending' status
    if (account.status !== 'pending' || account.emailVerifiedAt) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Tài khoản không ở trạng thái chờ xác thực (pending).',
      );
    }

    // Only look for delivered, unused challenges
    const challenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        type: 'verify_email',
        isUsed: false,
        deliveryStatus: 'delivered',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.expiresAt < new Date()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_EXPIRED,
        'Mã OTP không hợp lệ hoặc đã hết hạn',
      );
    }

    if (challenge.attempts >= OtpService.MAX_ATTEMPTS) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        'Bạn đã nhập sai mã OTP quá 5 lần. Vui lòng yêu cầu mã mới.',
        { details: { remainingAttempts: 0 } },
      );
    }

    const isMatch = this.otpService.verifyOtpHash(dto.otp, challenge.otpHash);
    if (!isMatch) {
      // Atomic increment on attempts to prevent overwrites under concurrent requests
      const updatedChallenge = await this.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });

      const remaining = OtpService.MAX_ATTEMPTS - updatedChallenge.attempts;

      if (remaining <= 0) {
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
          'Bạn đã nhập sai mã OTP quá 5 lần. Vui lòng yêu cầu mã mới.',
          { details: { remainingAttempts: 0 } },
        );
      }

      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_INVALID,
        `Mã OTP không chính xác. Còn lại ${remaining} lần thử.`,
        { details: { remainingAttempts: remaining } },
      );
    }

    // Confirm user exists and is provisioned in User & Trust Service
    await this.userTrustClient.confirmUserStatus(
      account.userId,
      account.roles.map(({ role }) => role.name),
    );

    // Sign access token FIRST before modifying DB state
    const prep = await this.sessionService.prepareSession(
      account,
      clientIp,
      userAgent,
    );

    // Atomically commit in a transaction:
    // 1. Mark challenge as used with conditional update so concurrent calls fail
    // 2. Mark account as active only if still pending
    // 3. Save the prepared session
    await this.db.$transaction(async (tx) => {
      const challengeUpdate = await tx.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          isUsed: false,
        },
        data: { isUsed: true },
      });

      if (challengeUpdate.count === 0) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.OTP_ALREADY_USED,
          'Mã OTP đã được sử dụng hoặc không hợp lệ.',
        );
      }

      const accountUpdate = await tx.account.updateMany({
        where: {
          id: account.id,
          status: 'pending',
        },
        data: {
          emailVerifiedAt: new Date(),
          status: 'active',
          updatedAt: new Date(),
        },
      });

      if (accountUpdate.count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.CONFLICT,
          'Tài khoản đã được kích hoạt trước đó.',
        );
      }

      await this.sessionService.saveSession(tx, {
        sessionId: prep.sessionId,
        accountId: account.id,
        refreshTokenHash: prep.refreshTokenHash,
        sessionExpiresAt: prep.sessionExpiresAt,
        sessionCreatedAt: prep.sessionCreatedAt,
        clientIp,
        userAgent,
      });
    });

    return AuthResponseBuilder.buildAuthSuccessResponse(
      'Xác thực OTP thành công',
      {
        accessToken: prep.token,
        refreshToken: prep.plainRefreshToken,
        expiresIn: prep.expiresIn,
      },
      prep.user,
    );
  }

  async resendOtp(dto: ResendOtpDto): Promise<ResendOtpResponse> {
    if (!dto.email && !dto.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Vui lòng cung cấp email hoặc số điện thoại',
      );
    }

    const whereClause: { email?: string; phone?: string } = {};
    if (dto.email) {
      whereClause.email = dto.email.trim().toLowerCase();
    } else if (dto.phone) {
      whereClause.phone = normalizeVietnamesePhone(dto.phone);
    }

    const account = await this.db.account.findFirst({
      where: whereClause,
    });

    if (!account) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Tài khoản không tồn tại',
      );
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đã bị tạm khóa. Không thể gửi lại mã OTP.',
      );
    }

    if (account.status === 'active' && account.emailVerifiedAt) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.CONFLICT,
        'Tài khoản đã được kích hoạt thành công. Vui lòng đăng nhập.',
      );
    }

    if (!account.email) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Tài khoản chưa có email để nhận OTP.',
      );
    }

    // Rate limiting: 5 resends / hour per account
    await this.rateLimiter.checkAndIncrement(
      `resend_account:${account.id}`,
      RESEND_OTP_LIMIT,
      RESEND_OTP_WINDOW_SECONDS,
      'Bạn đã yêu cầu gửi lại OTP quá 5 lần trong 1 giờ. Vui lòng thử lại sau.',
    );

    // Check cooldown on latest unused challenge
    const latestChallenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        type: 'verify_email',
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    if (latestChallenge && latestChallenge.resendAvailableAt > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((latestChallenge.resendAvailableAt.getTime() - now.getTime()) / 1000),
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.RATE_LIMITED,
        `Vui lòng đợi ${retryAfterSeconds} giây trước khi yêu cầu gửi lại OTP.`,
        { details: { retryAfterSeconds } },
      );
    }

    const newOtp = this.otpService.generateOtp();

    // Use a pending challenge as a placeholder to hold the resend slot immediately
    const pendingChallenge = await this.db.otpChallenge.create({
      data: {
        accountId: account.id,
        type: 'verify_email',
        otpHash: newOtp.hash,
        expiresAt: newOtp.expiresAt,
        resendAvailableAt: newOtp.resendAvailableAt,
        attempts: 0,
        isUsed: false,
        deliveryStatus: 'pending',
      },
    });

    // Send email via SMTP: do NOT invalidate existing valid challenge if sending fails
    try {
      await this.otpService.sendVerificationOtp(account.email, newOtp.code);
    } catch (sendError) {
      this.logger.error(
        `Failed to resend OTP email to ${account.email}: ${(sendError as Error).message}`,
      );

      // Invalidate the pending placeholder upon delivery failure
      await this.db.otpChallenge.update({
        where: { id: pendingChallenge.id },
        data: {
          deliveryStatus: 'failed',
          deliveryError: (sendError as Error).message,
          isUsed: true,
        },
      });

      throw new AppException(
        HttpStatus.FAILED_DEPENDENCY,
        ERROR_CODES.OTP_DELIVERY_FAILED,
        'Không thể gửi mã OTP qua email lúc này. Vui lòng thử lại sau giây lát.',
      );
    }

    // SMTP succeeded -> atomically invalidate old challenges and activate the new one
    await this.db.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: {
          accountId: account.id,
          type: 'verify_email',
          id: { not: pendingChallenge.id },
          isUsed: false,
        },
        data: { isUsed: true },
      });

      await tx.otpChallenge.update({
        where: { id: pendingChallenge.id },
        data: { deliveryStatus: 'delivered' },
      });
    });

    return AuthResponseBuilder.buildResendOtpResponse(
      newOtp,
      this.otpService.maskEmail(account.email),
    );
  }
}
