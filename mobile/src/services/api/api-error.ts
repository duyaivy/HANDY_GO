/**
 * Unified API Error Classification.
 */

export type ApiErrorKind
  = | 'NETWORK_ERROR'
    | 'AUTH_ERROR'
    | 'VALIDATION_ERROR'
    | 'SERVER_ERROR'
    | 'TIMEOUT_ERROR'
    | 'NOT_FOUND'
    | 'UNKNOWN_ERROR';

export type ApiErrorOptions = {
  statusCode?: number;
  errors?: Record<string, string[]>;
  originalError?: unknown;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly statusCode?: number;
  readonly originalError?: unknown;
  readonly errors?: Record<string, string[]>;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options?: ApiErrorOptions,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.errors = options?.errors;
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
    const message = data?.message || data?.error || 'Đã có lỗi xảy ra. Vui lòng thử lại.';

    if (status === 401 || status === 403) {
      return new ApiError('AUTH_ERROR', message || 'Phiên đăng nhập đã hết hạn.', { statusCode: status, originalError: error });
    }

    if (status === 404) {
      return new ApiError('NOT_FOUND', message || 'Không tìm thấy dữ liệu yêu cầu.', { statusCode: status, originalError: error });
    }

    if (status === 400 || status === 422) {
      return new ApiError('VALIDATION_ERROR', message || 'Dữ liệu không hợp lệ.', { statusCode: status, errors: data?.errors, originalError: error });
    }

    if (status >= 500) {
      return new ApiError('SERVER_ERROR', 'Máy chủ đang bảo trì hoặc gặp sự cố. Vui lòng thử lại sau.', { statusCode: status, originalError: error });
    }

    return new ApiError('UNKNOWN_ERROR', message, { statusCode: status, originalError: error });
  }
}
