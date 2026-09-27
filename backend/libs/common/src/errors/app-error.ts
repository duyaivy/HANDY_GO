import { HttpException } from '@nestjs/common';

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_PENDING: 'ACCOUNT_PENDING',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_ALREADY_USED: 'OTP_ALREADY_USED',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  RATE_LIMITED: 'RATE_LIMITED',
  OTP_DELIVERY_FAILED: 'OTP_DELIVERY_FAILED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  PROFILE_NOT_READY: 'PROFILE_NOT_READY',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_GATEWAY: 'BAD_GATEWAY',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

export interface AppErrorDetails {
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  verification?: {
    phone: string;
    emailMasked: string;
    expiresAt?: string;
    resendAvailableAt: string;
  };
}

export interface AppErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: AppErrorDetails;
}

export class AppException extends HttpException {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: {
      fieldErrors?: Record<string, string[]>;
      details?: AppErrorDetails;
    },
  ) {
    const body: AppErrorResponseBody = {
      statusCode,
      code,
      message,
      fieldErrors: options?.fieldErrors,
      details: options?.details,
    };
    super(body, statusCode);
  }
}
