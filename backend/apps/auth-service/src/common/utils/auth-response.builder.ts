import { HttpStatus } from '@nestjs/common';
import type { Account } from '@prisma/auth-client';
import type { GeneratedOtp } from '../../otp/otp.service.js';
import type { RegisterResponse } from '../../register/dto/register-response.dto.js';
import type { ResendOtpResponse } from '../../otp/dto/otp-responses.dto.js';
import type {
  AuthSuccessResponse,
  ForgotPasswordResponse,
  LogoutResponse,
  MeResponse,
  ResetPasswordResponse,
  UserSummaryDto,
  VerifyResetOtpResponse,
} from '../dto/auth-responses.dto.js';
import {
  DEFAULT_VERIFY_RESET_OTP_MESSAGE,
  RESET_TOKEN_EXPIRES_IN_SECONDS,
} from '../constants/auth.constants.js';

export class AuthResponseBuilder {
  static buildRegisterResponse(
    account: Pick<Account, 'userId'>,
    contact: { phone: string; email: string },
    otp: Pick<GeneratedOtp, 'expiresAt' | 'resendAvailableAt'>,
    maskedEmail: string,
    challengeId?: string,
  ): RegisterResponse {
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Đăng ký thành công. Vui lòng xác thực tài khoản qua mã OTP.',
      data: {
        challengeId,
        userId: account.userId,
        phone: contact.phone,
        email: contact.email,
        emailMasked: maskedEmail,
        expiresAt: otp.expiresAt.toISOString(),
        resendAvailableAt: otp.resendAvailableAt.toISOString(),
        verificationInstructions:
          'Nhập mã OTP 6 chữ số đã được gửi qua email để kích hoạt tài khoản.',
      },
    };
  }

  static buildAuthSuccessResponse(
    message: string,
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
    user: UserSummaryDto,
  ): AuthSuccessResponse {
    return {
      statusCode: HttpStatus.OK,
      message,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user,
      },
    };
  }

  static buildResendOtpResponse(
    otp: Pick<GeneratedOtp, 'expiresAt' | 'resendAvailableAt'>,
    maskedEmail: string,
    challengeId?: string,
  ): ResendOtpResponse {
    return {
      statusCode: HttpStatus.OK,
      message: 'Mã xác thực OTP mới đã được gửi thành công.',
      data: {
        challengeId,
        expiresAt: otp.expiresAt.toISOString(),
        resendAvailableAt: otp.resendAvailableAt.toISOString(),
        emailMasked: maskedEmail,
      },
    };
  }

  static buildLogoutResponse(message = 'Đăng xuất thành công'): LogoutResponse {
    return {
      statusCode: HttpStatus.OK,
      message,
      data: null,
    };
  }

  static buildForgotPasswordResponse(
    message = 'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
  ): ForgotPasswordResponse {
    return {
      statusCode: HttpStatus.OK,
      message,
      data: null,
    };
  }

  static buildVerifyResetOtpResponse(
    resetToken: string,
    expiresIn = RESET_TOKEN_EXPIRES_IN_SECONDS,
    message = DEFAULT_VERIFY_RESET_OTP_MESSAGE,
  ): VerifyResetOtpResponse {
    return {
      statusCode: HttpStatus.OK,
      message,
      data: {
        resetToken,
        expiresIn,
      },
    };
  }

  static buildResetPasswordResponse(
    message = 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.',
  ): ResetPasswordResponse {
    return {
      statusCode: HttpStatus.OK,
      message,
      data: null,
    };
  }


  static buildMeResponse(
    account: Pick<Account, 'userId' | 'phone' | 'email' | 'emailVerifiedAt' | 'status' | 'createdAt'>,
    roles: string[],
    permissions: string[],
  ): MeResponse {
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin tài khoản thành công',
      data: {
        id: account.userId,
        phone: account.phone,
        email: account.email,
        isVerified: account.emailVerifiedAt !== null,
        status: account.status,
        roles,
        permissions,
        createdAt: account.createdAt,
      },
    };
  }
}
