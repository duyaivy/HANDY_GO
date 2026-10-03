/**
 * Standard API Error Classification for HANDY GO.
 */

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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

export type ApiErrorKind
  = | 'NETWORK_ERROR'
    | 'AUTH_ERROR'
    | 'VALIDATION_ERROR'
    | 'RATE_LIMITED'
    | 'SERVER_ERROR'
    | 'TIMEOUT_ERROR'
    | 'NOT_FOUND'
    | 'UNKNOWN_ERROR';

export type ApiErrorDetails = {
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  verification?: {
    phone: string;
    emailMasked: string;
    expiresAt?: string;
    resendAvailableAt: string;
  };
  [key: string]: unknown;
};

export type ApiErrorOptions = {
  statusCode?: number;
  code?: ErrorCode;
  fieldErrors?: Record<string, string[]>;
  details?: ApiErrorDetails;
  originalError?: unknown;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly statusCode?: number;
  readonly code?: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;
  readonly details?: ApiErrorDetails;
  readonly originalError?: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options?: ApiErrorOptions,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.fieldErrors = options?.fieldErrors;
    this.details = options?.details;
    this.originalError = options?.originalError;
  }

  static fromAxiosError(error: any): ApiError {
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new ApiError('TIMEOUT_ERROR', 'Kết nối mạng quá thời gian chờ. Vui lòng thử lại.', { originalError: error });
    }

    if (!error.response) {
      return new ApiError('NETWORK_ERROR', 'Không có kết nối mạng. Vui lòng kiểm tra WiFi hoặc 4G.', { originalError: error });
    }

    const status = error.response.status;
    const data = error.response.data;
    const code = data?.code as ErrorCode | undefined;
    const fieldErrors = (data?.fieldErrors || data?.errors) as Record<string, string[]> | undefined;
    const details = data?.details as ApiErrorDetails | undefined;
    const message = data?.message || data?.error || 'Đã có lỗi xảy ra. Vui lòng thử lại.';

    if (code === ERROR_CODES.RATE_LIMITED || status === 429) {
      return new ApiError('RATE_LIMITED', message, {
        statusCode: status,
        code: code || ERROR_CODES.RATE_LIMITED,
        fieldErrors,
        details,
        originalError: error,
      });
    }

    if (code === ERROR_CODES.VALIDATION_ERROR || status === 400 || status === 422) {
      return new ApiError('VALIDATION_ERROR', message, {
        statusCode: status,
        code: code || ERROR_CODES.VALIDATION_ERROR,
        fieldErrors,
        details,
        originalError: error,
      });
    }

    if (status === 401 || status === 403) {
      return new ApiError('AUTH_ERROR', message, {
        statusCode: status,
        code,
        fieldErrors,
        details,
        originalError: error,
      });
    }

    if (status === 404) {
      return new ApiError('NOT_FOUND', message, {
        statusCode: status,
        code,
        fieldErrors,
        details,
        originalError: error,
      });
    }

    if (status >= 500) {
      return new ApiError('SERVER_ERROR', 'Máy chủ đang bảo trì hoặc gặp sự cố. Vui lòng thử lại sau.', {
        statusCode: status,
        code,
        fieldErrors,
        details,
        originalError: error,
      });
    }

    return new ApiError('UNKNOWN_ERROR', message, {
      statusCode: status,
      code,
      fieldErrors,
      details,
      originalError: error,
    });
  }
}
