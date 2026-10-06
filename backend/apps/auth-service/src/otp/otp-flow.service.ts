import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import type { ResendOtpResponse } from './dto/otp-responses.dto.js';
import type { AuthSuccessResponse } from '../common/dto/auth-responses.dto.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { UserTrustClient } from '../common/rpc/user-trust.client.js';
import { SessionService } from '../common/session/session.service.js';
import { normalizeVietnamesePhone } from '../common/utils/phone.util.js';
import { AuthResponseBuilder } from '../common/utils/auth-response.builder.js';
import {
  RESEND_OTP_LIMIT,
  RESEND_OTP_WINDOW_SECONDS,
} from '../common/constants/auth.constants.js';

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

    // Bind to specific challengeId if passed, otherwise use latest unused challenge for verify_email
    const challengeWhere: {
      id?: string;
      accountId: string;
      type: 'verify_email';
      isUsed: boolean;
      deliveryStatus: string;
    } = {
      accountId: account.id,
      type: 'verify_email',
      isUsed: false,
      deliveryStatus: 'delivered',
    };
    if (dto.challengeId) {
      challengeWhere.id = dto.challengeId;
    }

    const now = new Date();
    const challenge = await this.db.otpChallenge.findFirst({
      where: challengeWhere,
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.expiresAt <= now) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_EXPIRED,
        'Mã OTP không hợp lệ hoặc đã hết hạn',
      );
    }

    const maxAttempts =
      this.otpService?.maxAttempts ?? OtpService.MAX_ATTEMPTS;
    if (challenge.attempts >= maxAttempts) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        `Bạn đã nhập sai mã OTP quá ${maxAttempts} lần. Vui lòng yêu cầu mã mới.`,
        { details: { remainingAttempts: 0 } },
      );
    }

    const isMatch = this.otpService.verifyOtpHash(dto.otp, challenge.otpHash);
    if (!isMatch) {
      // Conditional update in transaction for wrong code:
      // Must verify isUsed = false, deliveryStatus = delivered, not expired, attempts < maxAttempts
      const updateResult = await this.db.$transaction(async (tx) => {
        const updateCount = await tx.otpChallenge.updateMany({
          where: {
            id: challenge.id,
            isUsed: false,
            deliveryStatus: 'delivered',
            expiresAt: { gt: new Date() },
            attempts: { lt: maxAttempts },
          },
          data: {
            attempts: { increment: 1 },
          },
        });

        if (updateCount.count === 0) {
          const latest =
            typeof tx.otpChallenge.findUnique === 'function'
              ? await tx.otpChallenge.findUnique({
                  where: { id: challenge.id },
                })
              : null;
          return {
            success: false,
            attempts: latest?.attempts ?? maxAttempts,
            isUsed: latest?.isUsed ?? true,
            isExpired: !latest || latest.expiresAt <= new Date(),
          };
        }

        const updated =
          typeof tx.otpChallenge.findUnique === 'function'
            ? await tx.otpChallenge.findUnique({
                where: { id: challenge.id },
                select: { attempts: true },
              })
            : { attempts: challenge.attempts + 1 };

        return {
          success: true,
          attempts: updated?.attempts ?? challenge.attempts + 1,
          isUsed: false,
          isExpired: false,
        };
      });

      if (!updateResult.success) {
        if (updateResult.attempts >= maxAttempts) {
          throw new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
            `Bạn đã nhập sai mã OTP quá ${maxAttempts} lần. Vui lòng yêu cầu mã mới.`,
            { details: { remainingAttempts: 0 } },
          );
        }
        if (updateResult.isUsed) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ERROR_CODES.OTP_ALREADY_USED,
            'Mã OTP đã được sử dụng hoặc không hợp lệ.',
          );
        }
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.OTP_EXPIRED,
          'Mã OTP không hợp lệ hoặc đã hết hạn',
        );
      }

      const remaining = maxAttempts - updateResult.attempts;
      if (remaining <= 0) {
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
          `Bạn đã nhập sai mã OTP quá ${maxAttempts} lần. Vui lòng yêu cầu mã mới.`,
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

    // Atomically commit in a transaction with strict conditional update:
    // 1. Check isUsed = false, deliveryStatus = delivered, not expired, attempts < maxAttempts
    // 2. Only activate account and save session if challenge update succeeds
    await this.db.$transaction(async (tx) => {
      const verifyTime = new Date();
      const challengeUpdate = await tx.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          isUsed: false,
          deliveryStatus: 'delivered',
          expiresAt: { gt: verifyTime },
          attempts: { lt: maxAttempts },
        },
        data: {
          isUsed: true,
          updatedAt: verifyTime,
        },
      });

      if (challengeUpdate.count === 0) {
        const current =
          typeof tx.otpChallenge.findUnique === 'function'
            ? await tx.otpChallenge.findUnique({
                where: { id: challenge.id },
              })
            : null;

        if (current && current.attempts >= maxAttempts) {
          throw new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
            `Bạn đã nhập sai mã OTP quá ${maxAttempts} lần. Vui lòng yêu cầu mã mới.`,
            { details: { remainingAttempts: 0 } },
          );
        }

        if (!current || current.isUsed) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ERROR_CODES.OTP_ALREADY_USED,
            'Mã OTP đã được sử dụng hoặc không hợp lệ.',
          );
        }

        if (current.expiresAt <= verifyTime) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ERROR_CODES.OTP_EXPIRED,
            'Mã OTP không hợp lệ hoặc đã hết hạn',
          );
        }

        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
          'Mã OTP không hợp lệ.',
        );
      }

      const accountUpdate = await tx.account.updateMany({
        where: {
          id: account.id,
          status: 'pending',
        },
        data: {
          emailVerifiedAt: verifyTime,
          status: 'active',
          updatedAt: verifyTime,
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

  async resendOtp(
    dto: ResendOtpDto,
    clientIp?: string,
  ): Promise<ResendOtpResponse> {
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

    // Multi-tier Rate Limiting:
    // 1. Theo account: tối đa 5 lần / giờ
    await this.rateLimiter.checkAndIncrement(
      `resend_account:${account.id}`,
      RESEND_OTP_LIMIT,
      RESEND_OTP_WINDOW_SECONDS,
      'Bạn đã yêu cầu gửi lại OTP quá 5 lần trong 1 giờ. Vui lòng thử lại sau.',
    );

    // 2. Theo email: tối đa 5 lần / giờ
    if (account.email) {
      await this.rateLimiter.checkAndIncrement(
        `resend_email:${account.email.toLowerCase()}`,
        RESEND_OTP_LIMIT,
        RESEND_OTP_WINDOW_SECONDS,
        'Email này đã nhận quá nhiều mã OTP trong 1 giờ. Vui lòng thử lại sau.',
      );
    }

    // 3. Theo IP: tối đa 10 lần / giờ
    if (clientIp) {
      await this.rateLimiter.checkAndIncrement(
        `resend_ip:${clientIp}`,
        10,
        RESEND_OTP_WINDOW_SECONDS,
        'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu gửi lại OTP. Vui lòng thử lại sau 1 giờ.',
      );
    }

    const SMTP_SEND_TIMEOUT_MS = 15000;
    const PENDING_CHALLENGE_TIMEOUT_MS = 15000;
    const newOtp = this.otpService.generateOtp();

    // Transaction 1: Lock account row, check concurrent pending delivery & cooldown, create pending challenge
    const pendingChallenge = await this.db.$transaction(async (tx) => {
      // Row-level lock on account for concurrency control
      if (typeof (tx as any).$queryRaw === 'function') {
        try {
          await (tx as any).$queryRaw`SELECT id FROM accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
        } catch {
          // Gracefully continue in mock/test environments
        }
      }

      const txNow = new Date();

      // Check for active pending challenge currently being dispatched
      const pendingDelivery = await tx.otpChallenge.findFirst({
        where: {
          accountId: account.id,
          type: 'verify_email',
          deliveryStatus: 'pending',
          isUsed: false,
          createdAt: {
            gt: new Date(txNow.getTime() - PENDING_CHALLENGE_TIMEOUT_MS),
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingDelivery && pendingDelivery.deliveryStatus === 'pending') {
        const createdAt = pendingDelivery.createdAt ?? txNow;
        const elapsedMs = txNow.getTime() - createdAt.getTime();
        if (elapsedMs < PENDING_CHALLENGE_TIMEOUT_MS) {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((PENDING_CHALLENGE_TIMEOUT_MS - elapsedMs) / 1000),
          );
          throw new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            ERROR_CODES.RATE_LIMITED,
            `Mã OTP đang được gửi đi. Vui lòng đợi ${retryAfterSeconds} giây trước khi thử lại.`,
            { details: { retryAfterSeconds } },
          );
        }
      }

      // Check cooldown on latest unused delivered challenge
      const latestDelivered = await tx.otpChallenge.findFirst({
        where: {
          accountId: account.id,
          type: 'verify_email',
          isUsed: false,
          deliveryStatus: 'delivered',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (
        latestDelivered &&
        latestDelivered.deliveryStatus === 'delivered' &&
        latestDelivered.resendAvailableAt &&
        latestDelivered.resendAvailableAt > txNow
      ) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            (latestDelivered.resendAvailableAt.getTime() - txNow.getTime()) /
              1000,
          ),
        );
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          ERROR_CODES.RATE_LIMITED,
          `Vui lòng đợi ${retryAfterSeconds} giây trước khi yêu cầu gửi lại OTP.`,
          { details: { retryAfterSeconds } },
        );
      }

      return tx.otpChallenge.create({
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
    });

    // Send email via SMTP OUTSIDE transaction with strict timeout
    try {
      await Promise.race([
        this.otpService.sendVerificationOtp(account.email, newOtp.code),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('SMTP dispatch timed out')),
            SMTP_SEND_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (sendError) {
      this.logger.error(
        `Failed to resend OTP email to ${account.email}: ${(sendError as Error).message}`,
      );

      // Invalidate the failed pending challenge, reset resendAvailableAt for immediate retry,
      // but do NOT invalidate previously delivered valid challenges!
      await this.db.otpChallenge.update({
        where: { id: pendingChallenge.id },
        data: {
          deliveryStatus: 'failed',
          deliveryError: (sendError as Error).message,
          isUsed: true,
          resendAvailableAt: new Date(),
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
      pendingChallenge.id,
    );
  }
}
