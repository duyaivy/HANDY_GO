import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
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
import {
  FORGOT_PASSWORD_EMAIL_LIMIT,
  FORGOT_PASSWORD_IP_LIMIT,
  FORGOT_PASSWORD_WINDOW_SECONDS,
  VERIFY_RESET_OTP_IP_LIMIT,
  VERIFY_RESET_OTP_WINDOW_SECONDS,
} from '../common/constants/auth.constants.js';

@Injectable()
export class PasswordResetFlowService {
  private readonly logger = new Logger(PasswordResetFlowService.name);

  constructor(
    private readonly db: AuthPrismaService,
    private readonly otpService: OtpService,
    private readonly rateLimiter: RateLimiterService,
    private readonly sessionService: SessionService,
  ) {}

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
