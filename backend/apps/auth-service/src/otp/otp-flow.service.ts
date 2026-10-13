import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { ResendOtpResponse } from './dto/otp-responses.dto.js';
import type {
  AuthSuccessResponse,
  ForgotPasswordResponse,
  VerifyResetOtpResponse,
  ResetPasswordResponse,
} from '../common/dto/auth-responses.dto.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { UserTrustClient } from '../common/rpc/user-trust.client.js';
import { SessionService } from '../common/session/session.service.js';
import { normalizeVietnamesePhone } from '../common/utils/phone.util.js';
import { AuthResponseBuilder } from '../common/utils/auth-response.builder.js';
import {
  RESEND_OTP_LIMIT,
  RESEND_OTP_WINDOW_SECONDS,
  FORGOT_PASSWORD_EMAIL_LIMIT,
  FORGOT_PASSWORD_IP_LIMIT,
  FORGOT_PASSWORD_WINDOW_SECONDS,
  VERIFY_RESET_OTP_IP_LIMIT,
  VERIFY_RESET_OTP_WINDOW_SECONDS,
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

    const maxAttempts = this.otpService?.maxAttempts ?? OtpService.MAX_ATTEMPTS;
    if (challenge.attempts >= maxAttempts) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        `Bạn đã nhập sai mã OTP quá ${maxAttempts} lần. Vui lòng yêu cầu mã mới.`,
        { data: { remainingAttempts: 0 } },
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
            { data: { remainingAttempts: 0 } },
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
          { data: { remainingAttempts: 0 } },
        );
      }

      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_INVALID,
        `Mã OTP không chính xác. Còn lại ${remaining} lần thử.`,
        { data: { remainingAttempts: remaining } },
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
            { data: { remainingAttempts: 0 } },
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
        await (tx as any).$queryRaw`
          SELECT id
          FROM "auth_service"."accounts"
          WHERE id = ${account.id}::uuid
          FOR UPDATE
        `;
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
            { data: { retryAfterSeconds } },
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
          { data: { retryAfterSeconds } },
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

  async forgotPassword(
    dto: ForgotPasswordDto,
    clientIp?: string,
  ): Promise<ForgotPasswordResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Giới hạn tần suất theo IP: tối đa 10 yêu cầu/giờ
    const ip = clientIp || '127.0.0.1';
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

    // 3. Tra cứu tài khoản theo email đã chuẩn hóa
    const account = await this.db.account.findUnique({
      where: { email: normalizedEmail },
    });

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
      // KHÔNG tạo challenge, KHÔNG gửi email.
      // Trả cùng status và body công khai để tránh dò tài khoản (chống user enumeration).
      return AuthResponseBuilder.buildForgotPasswordResponse();
    }

    // 5. Vô hiệu hóa challenge reset_password cũ còn hiệu lực của tài khoản này
    // "Challenge cũ không còn dùng được sau yêu cầu mới"
    await this.db.otpChallenge.updateMany({
      where: {
        accountId: account.id,
        type: 'reset_password',
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // 6. Tạo OTP ngẫu nhiên mới với HMAC hash và thời hạn (mặc định 10 phút)
    const otp = this.otpService.generateOtp();

    const challenge = await this.db.otpChallenge.create({
      data: {
        accountId: account.id,
        type: 'reset_password',
        otpHash: otp.hash,
        expiresAt: otp.expiresAt,
        resendAvailableAt: otp.resendAvailableAt,
        isUsed: false,
        deliveryStatus: 'pending',
      },
    });

    // 7. Gửi email qua SMTP hiện có với nội dung riêng cho đặt lại mật khẩu
    try {
      await this.otpService.sendPasswordResetOtp(normalizedEmail, otp.code);
      await this.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { deliveryStatus: 'delivered' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to deliver password reset OTP email: ${(error as Error).message}`,
      );
      await this.db.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          deliveryStatus: 'failed',
          deliveryError: (error as Error).message,
        },
      });
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
    // 1. Giới hạn tần suất theo IP: tối đa 10 yêu cầu/giờ
    const ip = clientIp || '127.0.0.1';
    await this.rateLimiter.checkAndIncrement(
      `verify_reset_otp_ip:${ip}`,
      VERIFY_RESET_OTP_IP_LIMIT,
      VERIFY_RESET_OTP_WINDOW_SECONDS,
      'Địa chỉ IP của bạn đã gửi quá nhiều yêu cầu xác thực OTP đặt lại mật khẩu. Vui lòng thử lại sau 1 giờ.',
    );

    const normalizedEmail = dto.email.trim().toLowerCase();

    // 2. Tra cứu tài khoản theo email đã chuẩn hóa
    const account = await this.db.account.findUnique({
      where: { email: normalizedEmail },
    });

    if (!account) {
      this.throwGenericResetOtpError();
    }

    if (['suspended', 'locked', 'deleted'].includes(account.status)) {
      this.throwGenericResetOtpError();
    }

    // 3. Tìm challenge OTP mục đích reset_password mới nhất
    const now = new Date();
    const maxAttempts = this.otpService?.maxAttempts ?? OtpService.MAX_ATTEMPTS;

    const challenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        type: 'reset_password',
      },
      orderBy: { createdAt: 'desc' },
    });

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
      // Vẫn giữ bộ đếm tối đa 5 lần sai trong database
      await this.db.$transaction(async (tx) => {
        await tx.otpChallenge.updateMany({
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
      });

      // Phản hồi lỗi chung, không tiết lộ số lần thử còn lại hay trạng thái challenge
      this.throwGenericResetOtpError();
    }

    // 5. Khi OTP hợp lệ:
    // Tạo reset grant ngẫu nhiên (32 bytes hex), ngắn hạn (15 phút), chỉ lưu hash (SHA-256)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const grantLifetimeSeconds = 15 * 60; // 15 phút
    const grantExpiresAt = new Date(Date.now() + grantLifetimeSeconds * 1000);

    // Cập nhật nguyên tử trong transaction: đánh dấu challenge đã dùng và tạo grant
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
        this.throwGenericResetOtpError();
      }

      // Vô hiệu hóa bất kỳ grant chưa dùng nào trước đó của tài khoản này
      await tx.passwordResetGrant.updateMany({
        where: {
          accountId: account.id,
          isUsed: false,
        },
        data: {
          isUsed: true,
        },
      });

      // Tạo reset grant mới
      await tx.passwordResetGrant.create({
        data: {
          accountId: account.id,
          tokenHash,
          expiresAt: grantExpiresAt,
          isUsed: false,
        },
      });
    });

    return AuthResponseBuilder.buildVerifyResetOtpResponse(
      resetToken,
      grantLifetimeSeconds,
    );
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponse> {
    // 1. Hash resetToken để tra cứu
    const tokenHash = crypto.createHash('sha256').update(dto.resetToken).digest('hex');

    const grant = await this.db.passwordResetGrant.findUnique({
      where: { tokenHash },
    });

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

    // 2. Mã hóa mật khẩu mới bằng bcrypt trước khi mở transaction
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);

    // 3. Trong một transaction duy nhất:
    // - Tiêu thụ grant bằng cập nhật có điều kiện (CAS: isUsed: false, expiresAt > now)
    // - Cập nhật bcrypt hash và passwordChangedAt
    // - Thu hồi tất cả Refresh Session hiện có của tài khoản
    await this.db.$transaction(async (tx) => {
      const updateTime = new Date();

      const grantUpdate = await tx.passwordResetGrant.updateMany({
        where: {
          id: grant.id,
          isUsed: false,
          expiresAt: { gt: updateTime },
        },
        data: {
          isUsed: true,
          usedAt: updateTime,
        },
      });

      if (grantUpdate.count === 0) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
          'Mã xác thực đặt lại mật khẩu đã được sử dụng hoặc đã hết hạn.',
        );
      }

      await tx.account.update({
        where: { id: grant.accountId },
        data: {
          passwordHash: newPasswordHash,
          passwordChangedAt: updateTime,
          updatedAt: updateTime,
        },
      });

      await this.sessionService.revokeAllSessions(grant.accountId, tx);
    });

    return AuthResponseBuilder.buildResetPasswordResponse();
  }
}


